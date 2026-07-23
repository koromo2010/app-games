import { ensurePostgresSchema } from "@/lib/postgres-schema";
import { getPostgresClient, isPostgresConfigured } from "@/lib/postgres-store";

export type PlayerDebugAccessAdminSummary = {
  playerId: string;
  displayName: string;
  hasRecoveryEmail: boolean;
  automaticAccess: boolean;
  manualAccess: boolean;
  grantedByEmail: string | null;
  grantedAt: number | null;
};

type PlayerDebugAccessAdminRow = {
  player_id: string;
  display_name: string;
  has_recovery_email: boolean;
  automatic_access: boolean;
  manual_access: boolean;
  granted_by_email: string | null;
  granted_at: string | number | null;
};

function requireStore() {
  if (!isPostgresConfigured()) throw new Error("PLAYER_DEBUG_ACCESS_STORE_NOT_CONFIGURED");
}

function normalizePlayerId(playerId: string) {
  const normalized = playerId.trim();
  if (!normalized || normalized.length > 128) throw new Error("PLAYER_DEBUG_ACCESS_INVALID_PLAYER_ID");
  return normalized;
}

function normalizeSearch(query: string) {
  return query.normalize("NFKC").trim().slice(0, 80);
}

function summary(row: PlayerDebugAccessAdminRow): PlayerDebugAccessAdminSummary {
  return {
    playerId: row.player_id,
    displayName: row.display_name,
    hasRecoveryEmail: row.has_recovery_email === true,
    automaticAccess: row.automatic_access === true,
    manualAccess: row.manual_access === true,
    grantedByEmail: row.granted_by_email,
    grantedAt: row.granted_at === null ? null : Number(row.granted_at),
  };
}

export async function listPlayerDebugAccessCandidates(searchInput = "") {
  requireStore();
  await ensurePostgresSchema();
  const search = normalizeSearch(searchInput);
  const pattern = `%${search}%`;
  const rows = await getPostgresClient()`
    SELECT player.player_id, player.display_name,
      (player.email IS NOT NULL AND player.email_verified_at IS NOT NULL) AS has_recovery_email,
      (admin.email IS NOT NULL AND player.email_verified_at IS NOT NULL) AS automatic_access,
      (manual.player_id IS NOT NULL) AS manual_access,
      manual.granted_by_email,
      manual.updated_at AS granted_at
    FROM player_accounts player
    LEFT JOIN site_admin_accounts admin ON admin.email = player.email
    LEFT JOIN player_debug_access_grants manual ON manual.player_id = player.player_id
    WHERE ${search} = '' OR player.display_name ILIKE ${pattern} OR player.login_name ILIKE ${pattern}
    ORDER BY (manual.player_id IS NOT NULL) DESC, (admin.email IS NOT NULL AND player.email_verified_at IS NOT NULL) DESC, player.updated_at DESC
    LIMIT 50
  ` as PlayerDebugAccessAdminRow[];
  return rows.map(summary);
}

export async function grantPlayerDebugAccess(playerIdInput: string, grantedByEmail: string | null) {
  requireStore();
  await ensurePostgresSchema();
  const playerId = normalizePlayerId(playerIdInput);
  const sql = getPostgresClient();
  const players = await sql`SELECT player_id FROM player_accounts WHERE player_id = ${playerId} LIMIT 1` as Array<{ player_id: string }>;
  if (!players[0]) throw new Error("PLAYER_DEBUG_ACCESS_PLAYER_NOT_FOUND");
  const now = Date.now();
  await sql`
    INSERT INTO player_debug_access_grants (player_id, granted_by_email, created_at, updated_at)
    VALUES (${playerId}, ${grantedByEmail}, ${now}, ${now})
    ON CONFLICT (player_id) DO UPDATE SET granted_by_email = EXCLUDED.granted_by_email, updated_at = EXCLUDED.updated_at
  `;
}

export async function revokePlayerDebugAccess(playerIdInput: string) {
  requireStore();
  await ensurePostgresSchema();
  const playerId = normalizePlayerId(playerIdInput);
  const rows = await getPostgresClient()`
    DELETE FROM player_debug_access_grants WHERE player_id = ${playerId} RETURNING player_id
  ` as Array<{ player_id: string }>;
  return rows.length > 0;
}
