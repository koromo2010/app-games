import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";
import {
  productionOwnerRestorationUsername,
  type ProductionOwnerRestorationAccountSource,
} from "@/lib/production-owner-restoration";

export async function readExactProductionOwnerRestorationAccounts(): Promise<ProductionOwnerRestorationAccountSource[]> {
  if (!isPostgresConfigured()) throw new Error("OWNER_RESTORATION_ACCOUNT_STORE_NOT_CONFIGURED");
  const rows = await getPostgresClient()`
    SELECT player.login_name AS username, player.player_id AS account_identity,
      (player.email IS NOT NULL AND player.email_verified_at IS NOT NULL) AS has_recovery_email,
      ((admin.email IS NOT NULL AND player.email_verified_at IS NOT NULL) OR manual.player_id IS NOT NULL) AS grant_present
    FROM player_accounts player
    LEFT JOIN site_admin_accounts admin ON admin.email = player.email
    LEFT JOIN player_debug_access_grants manual ON manual.player_id = player.player_id
    WHERE player.login_name = ${productionOwnerRestorationUsername}
    LIMIT 2
  ` as Array<{ username: string; account_identity: string; has_recovery_email: boolean; grant_present: boolean }>;
  return rows.map((row) => ({
    username: row.username,
    accountIdentity: row.account_identity,
    hasRecoveryEmail: row.has_recovery_email === true,
    grantPresent: row.grant_present === true,
  }));
}
