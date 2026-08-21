import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";
import {
  blockSdkAccountForDeletion,
  completeSdkAccountDeletion,
} from "@/lib/account-deletion-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorize(request: Request) {
  try {
    requireSdkServiceRequest(request);
    return null;
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
}

/**
 * Idempotent SDK side of account deletion. Mutable entry points and OAuth
 * authority are revoked immediately, while immutable revisions remain
 * resolvable for Rooms whose contracts were pinned before deletion.
 */
export async function DELETE(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as {
    playerId?: unknown;
    operationId?: unknown;
  } | null;
  const playerId = typeof body?.playerId === "string"
    ? body.playerId.trim()
    : "";
  const operationId = typeof body?.operationId === "string" ? body.operationId.trim() : "";
  if (!playerId || playerId.length > 120 || !/^[0-9a-f-]{36}$/i.test(operationId)) {
    return Response.json({ error: "account_input_invalid" }, { status: 400 });
  }

  try {
    await ensureSdkSchema();
    await blockSdkAccountForDeletion(operationId, playerId);
    const games = await sdkSql()`
      UPDATE sdk_games g
      SET status = 'deleted',
          deleted_at = COALESCE(g.deleted_at, NOW()),
          updated_at = NOW()
      FROM sdk_creators c
      WHERE g.creator_id = c.id
        AND c.owner_player_id = ${playerId}
      RETURNING g.id
    `;
    const grants = await sdkSql()`
      UPDATE sdk_oauth_grants
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE player_id = ${playerId}
      RETURNING id
    `;
    const creators = await sdkSql()`
      UPDATE sdk_creators
      SET owner_player_id = NULL,
          display_name = 'Deleted creator',
          deleted_at = COALESCE(deleted_at, NOW()),
          updated_at = NOW()
      WHERE owner_player_id = ${playerId}
      RETURNING id
    `;
    await completeSdkAccountDeletion(operationId, playerId);
    return Response.json({
      deleted: true,
      affectedCreators: Array.isArray(creators) ? creators.length : 0,
      affectedGames: Array.isArray(games) ? games.length : 0,
      revokedGrants: Array.isArray(grants) ? grants.length : 0,
    });
  } catch {
    return Response.json({ error: "account_delete_failed" }, { status: 503 });
  }
}
