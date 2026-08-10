import { authenticateCreator, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";

export const dynamic = "force-dynamic";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export async function PUT() {
  return Response.json({
    saved: false,
    error: "LEGACY_UNBOUND_PACKAGE_PATH_DISABLED",
    instruction: "承認済み操作プロトタイプと同じmodule binding・usage・sourceをOAuth MCPのpublish_game_packageまたはpublish_game_source_packageへ渡してください。",
  }, { status: 410 });
}

/**
 * Logical deletion is immediate for catalogs and new Preview sessions. Package
 * revisions and channel history remain immutable so already-created Rooms can
 * finish on their pinned contract and operators retain an audit trail.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ instanceId: string; gameId: string }> },
) {
  const params = await context.params;
  const slug = normalizeInstanceSlug(params.instanceId);
  const gameId = params.gameId.trim().toLowerCase();
  const token = bearerToken(request);
  if (validateInstanceSlug(slug) || !GAME_PATTERN.test(gameId) || !token) {
    return Response.json({ deleted: false, error: "認証情報が必要です。" }, { status: 401 });
  }
  try {
    const creator = await authenticateCreator(slug, token);
    if (!creator) {
      return Response.json({ deleted: false, error: "認証情報が正しくありません。" }, { status: 403 });
    }
    await ensureSdkSchema();
    const rows = await sdkSql()`
      UPDATE sdk_games
      SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
      WHERE creator_id = ${creator.id}
        AND game_id = ${gameId}
        AND deleted_at IS NULL
      RETURNING game_id
    `;
    return Response.json({
      deleted: Array.isArray(rows) && rows.length > 0,
      gameId,
    });
  } catch {
    return Response.json({
      deleted: false,
      error: "ゲームを現在削除できません。",
    }, { status: 503 });
  }
}
