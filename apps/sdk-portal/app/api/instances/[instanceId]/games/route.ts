import { authenticateCreator, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";
import platformRelease from "../../../../../../../config/platform-release.json";

export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function GET(_: Request, context: { params: Promise<{ instanceId: string }> }) {
  const slug = normalizeInstanceSlug((await context.params).instanceId);
  if (validateInstanceSlug(slug)) return Response.json({ games: [] }, { status: 400 });
  try {
    await ensureSdkSchema();
    const games = await sdkSql()`
      SELECT g.game_id AS "gameId", g.title, g.description, g.manifest,
             g.sdk_package_version AS "sdkPackageVersion", g.sdk_contract_version AS "sdkContractVersion",
             g.status, g.updated_at AS "updatedAt"
      FROM sdk_games g JOIN sdk_creators c ON c.id = g.creator_id
      WHERE c.slug = ${slug} ORDER BY g.updated_at DESC
    `;
    return Response.json({ games });
  } catch { return Response.json({ games: [], error: "ゲーム一覧を現在取得できません。" }, { status: 503 }); }
}

export async function PUT(request: Request, context: { params: Promise<{ instanceId: string }> }) {
  const slug = normalizeInstanceSlug((await context.params).instanceId);
  const token = bearerToken(request);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (validateInstanceSlug(slug) || !token) return Response.json({ saved: false, error: "認証情報が必要です。" }, { status: 401 });
  const gameId = typeof body?.gameId === "string" ? body.gameId.trim().toLowerCase() : "";
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 500) : "";
  const manifest = body?.manifest;
  const sdkPackageVersion = typeof body?.sdkPackageVersion === "string" ? body.sdkPackageVersion.trim() : "";
  const sdkContractVersion = Number(body?.sdkContractVersion);
  const manifestJson = manifest && typeof manifest === "object" ? JSON.stringify(manifest) : "";
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(gameId) || !title || title.length > 120 || !manifestJson || manifestJson.length > 100_000 || !sdkPackageVersion || !platformRelease.supportedSdkContractVersions.includes(sdkContractVersion)) {
    return Response.json({ saved: false, error: "ゲーム登録情報が不正です。" }, { status: 400 });
  }
  try {
    const creator = await authenticateCreator(slug, token);
    if (!creator) return Response.json({ saved: false, error: "認証情報が正しくありません。" }, { status: 403 });
    const rows = await sdkSql()`
      INSERT INTO sdk_games (creator_id, game_id, title, description, manifest, sdk_package_version, sdk_contract_version)
      VALUES (${creator.id}, ${gameId}, ${title}, ${description}, ${manifestJson}::jsonb, ${sdkPackageVersion}, ${sdkContractVersion})
      ON CONFLICT (creator_id, game_id) DO UPDATE SET
        title = EXCLUDED.title, description = EXCLUDED.description, manifest = EXCLUDED.manifest,
        sdk_package_version = EXCLUDED.sdk_package_version, sdk_contract_version = EXCLUDED.sdk_contract_version,
        updated_at = NOW()
      RETURNING game_id AS "gameId", status, updated_at AS "updatedAt"
    `;
    return Response.json({ saved: true, game: Array.isArray(rows) ? rows[0] : null });
  } catch { return Response.json({ saved: false, error: "ゲーム情報を現在保存できません。" }, { status: 503 }); }
}
