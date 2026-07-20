import { getPostgresClient } from "@/lib/postgres-store";
import { ensurePostgresSchema } from "@/lib/postgres-schema";
import type { PlayerAccount } from "@/lib/player-account-store";

type PlayerAccountRow = {
  player_id: string;
  login_name: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  email: string | null;
  avatar_color: string;
  avatar_image: string | null;
  share_name_allowed: boolean;
  locale: string;
  terms_version: string | null;
  terms_accepted_at: string | number | null;
  privacy_version: string | null;
  created_at: string | number;
  updated_at: string | number;
};

function rowToAccount(row: PlayerAccountRow): PlayerAccount {
  return {
    version: 2,
    playerId: row.player_id,
    loginName: row.login_name,
    name: row.display_name,
    passwordHash: row.password_hash,
    passwordSalt: row.password_salt,
    email: row.email,
    avatarColor: row.avatar_color,
    avatarImage: row.avatar_image,
    shareNameAllowed: row.share_name_allowed === true,
    locale: row.locale === "en" ? "en" : "ja",
    termsVersion: row.terms_version,
    termsAcceptedAt: row.terms_accepted_at === null ? null : Number(row.terms_accepted_at),
    privacyVersion: row.privacy_version,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export async function ensurePlayerAccountSchema() {
  return ensurePostgresSchema();
}

export async function loadPostgresPlayerAccountByLogin(loginName: string) {
  await ensurePlayerAccountSchema();
  const sql = getPostgresClient();
  const rows = await sql`
    SELECT player_id, login_name, display_name, password_hash, password_salt, email,
           avatar_color, avatar_image, share_name_allowed, locale, terms_version, privacy_version, terms_accepted_at, created_at, updated_at
    FROM player_accounts
    WHERE login_name = ${loginName}
    LIMIT 1
  ` as PlayerAccountRow[];
  return rows[0] ? rowToAccount(rows[0]) : null;
}

export async function loadPostgresPlayerAccountByEmail(email: string) {
  await ensurePlayerAccountSchema();
  const sql = getPostgresClient();
  const rows = await sql`
    SELECT player_id, login_name, display_name, password_hash, password_salt, email,
           avatar_color, avatar_image, share_name_allowed, locale, terms_version, privacy_version, terms_accepted_at, created_at, updated_at
    FROM player_accounts
    WHERE email = ${email}
    LIMIT 1
  ` as PlayerAccountRow[];
  return rows[0] ? rowToAccount(rows[0]) : null;
}

export async function createPostgresPlayerAccount(account: PlayerAccount) {
  await ensurePlayerAccountSchema();
  const sql = getPostgresClient();
  const inserted = await sql`
    INSERT INTO player_accounts (
      login_name, player_id, display_name, password_hash, password_salt, email,
      avatar_color, avatar_image, share_name_allowed, locale, terms_version, privacy_version, terms_accepted_at, created_at, updated_at
    ) VALUES (
      ${account.loginName}, ${account.playerId}, ${account.name}, ${account.passwordHash},
      ${account.passwordSalt}, ${account.email}, ${account.avatarColor}, ${account.avatarImage}, ${account.shareNameAllowed}, ${account.locale}, ${account.termsVersion}, ${account.privacyVersion}, ${account.termsAcceptedAt},
      ${account.createdAt}, ${account.updatedAt}
    )
    ON CONFLICT DO NOTHING
    RETURNING login_name
  ` as Array<{ login_name: string }>;
  if (inserted.length > 0) return "created" as const;

  const conflicts = await sql`
    SELECT login_name, email
    FROM player_accounts
    WHERE login_name = ${account.loginName} OR (${account.email}::text IS NOT NULL AND email = ${account.email})
  ` as Array<{ login_name: string; email: string | null }>;
  if (conflicts.some((row) => row.login_name === account.loginName)) return "login-exists" as const;
  return "email-exists" as const;
}

export async function savePostgresPlayerAccount(account: PlayerAccount) {
  await ensurePlayerAccountSchema();
  const sql = getPostgresClient();
  await sql`
    INSERT INTO player_accounts (
      login_name, player_id, display_name, password_hash, password_salt, email,
      avatar_color, avatar_image, share_name_allowed, locale, terms_version, privacy_version, terms_accepted_at, created_at, updated_at
    ) VALUES (
      ${account.loginName}, ${account.playerId}, ${account.name}, ${account.passwordHash},
      ${account.passwordSalt}, ${account.email}, ${account.avatarColor}, ${account.avatarImage}, ${account.shareNameAllowed}, ${account.locale}, ${account.termsVersion}, ${account.privacyVersion}, ${account.termsAcceptedAt},
      ${account.createdAt}, ${account.updatedAt}
    )
    ON CONFLICT (login_name) DO UPDATE SET
      player_id = EXCLUDED.player_id,
      display_name = EXCLUDED.display_name,
      password_hash = EXCLUDED.password_hash,
      password_salt = EXCLUDED.password_salt,
      email = EXCLUDED.email,
      avatar_color = EXCLUDED.avatar_color,
      avatar_image = EXCLUDED.avatar_image,
      share_name_allowed = EXCLUDED.share_name_allowed,
      locale = EXCLUDED.locale,
      terms_version = COALESCE(player_accounts.terms_version, EXCLUDED.terms_version),
      privacy_version = COALESCE(player_accounts.privacy_version, EXCLUDED.privacy_version),
      terms_accepted_at = COALESCE(player_accounts.terms_accepted_at, EXCLUDED.terms_accepted_at),
      updated_at = EXCLUDED.updated_at
  `;
}

export async function updatePostgresPlayerAccountProfile(
  playerId: string,
  profile: Pick<PlayerAccount, "name" | "avatarColor" | "avatarImage" | "shareNameAllowed" | "locale" | "updatedAt">,
) {
  await ensurePlayerAccountSchema();
  const sql = getPostgresClient();
  await sql`
    UPDATE player_accounts
    SET display_name = ${profile.name},
        avatar_color = ${profile.avatarColor},
        avatar_image = ${profile.avatarImage},
        share_name_allowed = ${profile.shareNameAllowed},
        locale = ${profile.locale},
        updated_at = ${profile.updatedAt}
    WHERE player_id = ${playerId}
  `;
}

export async function deleteExpiredPostgresPlayerAccounts(cutoff: number) {
  await ensurePlayerAccountSchema();
  const sql = getPostgresClient();
  const deleted = await sql`
    WITH expired AS (
      DELETE FROM player_accounts
      WHERE email IS NULL AND updated_at <= ${cutoff}
      RETURNING player_id
    ), deleted_results AS (
      DELETE FROM player_game_results
      WHERE player_id IN (SELECT player_id FROM expired)
    )
    SELECT COUNT(*)::int AS count FROM expired
  ` as Array<{ count: number }>;
  return Number(deleted[0]?.count ?? 0);
}

export async function deletePostgresPlayerAccount(playerId: string) {
  await ensurePlayerAccountSchema();
  const sql = getPostgresClient();
  const deleted = await sql`
    WITH deleted_account AS (
      DELETE FROM player_accounts WHERE player_id = ${playerId} RETURNING player_id
    ), deleted_results AS (
      DELETE FROM player_game_results WHERE player_id = ${playerId}
    )
    SELECT COUNT(*)::int AS count FROM deleted_account
  ` as Array<{ count: number }>;
  return Number(deleted[0]?.count ?? 0) > 0;
}
