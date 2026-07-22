import { authenticateCreator, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";
import { saveMockFilesToGit } from "@/lib/mock-git-store";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";
import platformRelease from "../../../../../../../../../config/platform-release.json";

export const dynamic = "force-dynamic";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const MAX_REQUEST_BYTES = 7 * 1024 * 1024;

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ instanceId: string; gameId: string }> },
) {
  const params = await context.params;
  const slug = normalizeInstanceSlug(params.instanceId);
  const gameId = params.gameId.trim().toLowerCase();
  const token = bearerToken(request);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (validateInstanceSlug(slug) || !GAME_PATTERN.test(gameId) || !token) {
    return Response.json({ saved: false, error: "認証情報が必要です。" }, { status: 401 });
  }
  if (declaredLength > MAX_REQUEST_BYTES) {
    return Response.json({ saved: false, error: "モックファイルが大きすぎます。" }, { status: 413 });
  }

  const body = await request.json().catch(() => null) as {
    title?: unknown;
    description?: unknown;
    files?: unknown;
  } | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
  if (!title || title.length > 120 || !body?.files) {
    return Response.json({ saved: false, error: "モック登録情報が不正です。" }, { status: 400 });
  }

  try {
    const creator = await authenticateCreator(slug, token);
    if (!creator) return Response.json({ saved: false, error: "認証情報が正しくありません。" }, { status: 403 });

    const revision = await saveMockFilesToGit({ instanceId: slug, gameId, files: body.files });
    await ensureSdkSchema();
    const mockManifest = JSON.stringify({ stage: "mock", id: gameId });
    await sdkSql()`
      INSERT INTO sdk_games (
        creator_id, game_id, title, description, manifest,
        sdk_package_version, sdk_contract_version, mock_revision
      )
      VALUES (
        ${creator.id}, ${gameId}, ${title}, ${description}, ${mockManifest}::jsonb,
        ${platformRelease.sdkPackageVersion}, ${platformRelease.sdkContractVersion}, ${revision}
      )
      ON CONFLICT (creator_id, game_id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        mock_revision = EXCLUDED.mock_revision,
        updated_at = NOW()
    `;
    const portalBaseUrl = process.env.SDK_PORTAL_BASE_URL?.replace(/\/$/, "")
      ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://sdk.game-fields.com" : "https://sdk-dev.game-fields.com");
    const creatorUrl = `${portalBaseUrl}/${slug}/`;
    const gameUrl = `${portalBaseUrl}/${slug}/games/${gameId}`;
    return Response.json({
      saved: true,
      gameId,
      mockRevision: revision,
      creatorUrl,
      gameUrl,
      previewUrl: gameUrl,
    });
  } catch (error) {
    if (error instanceof Error && /invalid|missing|large|between|encoding|path/i.test(error.message)) {
      return Response.json({ saved: false, error: "モックファイルの形式が不正です。" }, { status: 400 });
    }
    return Response.json({ saved: false, error: "モックを現在保存できません。" }, { status: 503 });
  }
}
