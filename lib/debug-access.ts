import { playerEmailHasAdminDebugAccess } from "@/lib/debug-access-policy";
import { ensurePostgresSchema } from "@/lib/postgres-schema";
import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
export { actionRequiresDebugAccess, roomRequestsDebugMode } from "@/lib/debug-access-policy";

export async function playerHasDebugAccess(playerId: string) {
  if (!playerId.trim()) return false;
  if (!isPostgresConfigured()) return false;
  await ensurePostgresSchema();
  const rows = await getPostgresClient()`
    SELECT player.email AS player_email, admin.email AS admin_email
    FROM player_accounts player
    LEFT JOIN site_admin_accounts admin ON admin.email = player.email
    WHERE player.player_id = ${playerId}
    LIMIT 1
  ` as Array<{ player_email: string | null; admin_email: string | null }>;
  const row = rows[0];
  return playerEmailHasAdminDebugAccess(row?.player_email, row?.admin_email ? [row.admin_email] : []);
}

export async function requirePlayerDebugAccess(playerId: string) {
  if (!(await playerHasDebugAccess(playerId))) throw new Error("DEBUG_ACCESS_REQUIRED");
}
