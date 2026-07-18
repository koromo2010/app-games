import { playerHasResolvedDebugAccess } from "@/lib/debug-access-policy";
import { ensurePostgresSchema } from "@/lib/postgres-schema";
import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
export { actionRequiresDebugAccess, roomRequestsDebugMode } from "@/lib/debug-access-policy";

export async function playerHasDebugAccess(playerId: string) {
  if (!playerId.trim()) return false;
  if (!isPostgresConfigured()) return false;
  await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    SELECT player.email AS player_email, admin.email AS admin_email,
      (manual.player_id IS NOT NULL) AS manually_granted
    FROM player_accounts player
    LEFT JOIN site_admin_accounts admin ON admin.email = player.email
    LEFT JOIN player_debug_access_grants manual ON manual.player_id = player.player_id
    WHERE player.player_id = ${playerId}
    LIMIT 1
  ` as Array<{ player_email: string | null; admin_email: string | null; manually_granted: boolean }>;
  const row = rows[0];
  return playerHasResolvedDebugAccess(row?.player_email, row?.admin_email ? [row.admin_email] : [], row?.manually_granted === true);
}

export async function requirePlayerDebugAccess(playerId: string) {
  if (!(await playerHasDebugAccess(playerId))) throw new Error("DEBUG_ACCESS_REQUIRED");
}
