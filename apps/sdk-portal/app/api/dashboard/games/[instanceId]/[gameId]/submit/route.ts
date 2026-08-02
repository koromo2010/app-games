import { getSdkAccountSession } from "@/lib/account-session";
import {
  normalizeInstanceSlug,
  resolveCreatorOwner,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import { resolveSdkSession } from "@/lib/sdk-owner-classification";
import { logSdkSessionLookupFailure } from "@/lib/sdk-owner-observability";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; gameId: string }> },
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ submitted: false, error: "不正な送信元です。" }, { status: 403 });
  }
  const params = await context.params;
  const instanceId = normalizeInstanceSlug(params.instanceId);
  const gameId = params.gameId.trim().toLowerCase();
  if (validateInstanceSlug(instanceId) || !GAME_PATTERN.test(gameId)) {
    return Response.json({ submitted: false, error: "ゲーム指定が不正です。" }, { status: 400 });
  }
  let session;
  try {
    session = await resolveSdkSession(getSdkAccountSession);
  } catch (error) {
    logSdkSessionLookupFailure(error);
    return Response.json({ submitted: false, error: "アカウント情報を一時的に確認できません。" }, { status: 503 });
  }
  if (session.status === "session_missing") {
    return Response.json({ submitted: false, error: "再ログインしてください。" }, { status: 401 });
  }
  let owner;
  try {
    owner = await resolveCreatorOwner(instanceId, session.account.playerId);
  } catch {
    return Response.json({ submitted: false, error: "所有権情報を一時的に確認できません。" }, { status: 503 });
  }
  if (owner.status === "owner_mismatch") {
    return Response.json({ submitted: false, error: "このゲームを提出する権限がありません。" }, { status: 403 });
  }
  if (owner.status !== "authorized") {
    return Response.json({ submitted: false, error: "所有権情報に不整合があります。再接続では修復できません。" }, { status: 409 });
  }
  const creator = owner.creator;

  let rows;
  try {
    await ensureSdkSchema();
    rows = await sdkSql()`
      WITH candidate AS (
        SELECT g.id AS game_row_id, r.*
        FROM sdk_games g
        JOIN sdk_game_package_revisions r ON r.game_id = g.id
        WHERE g.creator_id = ${creator.id}
          AND g.game_id = ${gameId}
          AND g.deleted_at IS NULL
          AND r.revision IS DISTINCT FROM g.package_revision
        ORDER BY r.created_at DESC
        LIMIT 1
      )
      UPDATE sdk_games g
      SET manifest = candidate.manifest,
          sdk_package_version = candidate.sdk_package_version,
          sdk_contract_version = candidate.sdk_contract_version,
          package_revision = candidate.revision,
          package_root_sha256 = candidate.package_root_sha256,
          package_bundle_sha256 = candidate.server_bundle_sha256,
          package_app_set_sha256 = candidate.app_set_source_sha256,
          status = 'submitted',
          updated_at = NOW()
      FROM candidate
      WHERE g.id = candidate.game_row_id
      RETURNING candidate.revision
    `;
  } catch {
    return Response.json({ submitted: false, error: "提出サービスを一時的に利用できません。" }, { status: 503 });
  }
  const submitted = Array.isArray(rows) ? rows[0] as { revision?: string } | undefined : undefined;
  if (!submitted?.revision) {
    return Response.json({
      submitted: false,
      error: "正式提出できる検査済みデータがありません。制作環境で提出データを準備してください。",
    }, { status: 409 });
  }
  return Response.json({ submitted: true, gameId, packageRevision: submitted.revision });
}
