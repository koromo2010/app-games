import { authenticateCreator, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";
import { saveCreatorGamePackage } from "@/lib/game-package-store";

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
    return Response.json({ saved: false, error: "ゲームパッケージが大きすぎます。" }, { status: 413 });
  }
  const body = await request.json().catch(() => null) as { files?: unknown } | null;
  if (!body?.files) {
    return Response.json({ saved: false, error: "ゲームパッケージが必要です。" }, { status: 400 });
  }

  try {
    const creator = await authenticateCreator(slug, token);
    if (!creator) {
      return Response.json({ saved: false, error: "認証情報が正しくありません。" }, { status: 403 });
    }
    return Response.json(await saveCreatorGamePackage({
      creatorId: creator.id,
      creatorSlug: slug,
      gameId,
      files: body.files,
    }));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "GAME_SDK_PACKAGE_RELEASE_MISMATCH") {
      return Response.json({
        saved: false,
        error: "現在のPlatformと異なるSDK版のゲームパッケージです。",
      }, { status: 409 });
    }
    if (code === "GAME_SDK_PACKAGE_GAME_NOT_FOUND") {
      return Response.json({
        saved: false,
        error: "先にモックを保存してゲームIDを確定してください。",
      }, { status: 409 });
    }
    if (code.startsWith("GAME_SDK_PACKAGE_") || /upload|missing|invalid|large|path|encoding/i.test(code)) {
      return Response.json({ saved: false, error: code || "ゲームパッケージが不正です。" }, { status: 400 });
    }
    return Response.json({ saved: false, error: "ゲームパッケージを現在保存できません。" }, { status: 503 });
  }
}
