import { getPostgresClient } from "@/lib/postgres-store";

let schemaPromise: Promise<void> | null = null;

export async function ensurePostgresSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getPostgresClient();
      await sql`
        CREATE TABLE IF NOT EXISTS player_accounts (
          login_name TEXT PRIMARY KEY,
          player_id TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          email TEXT UNIQUE,
          avatar_color TEXT NOT NULL,
          avatar_image TEXT,
          share_name_allowed BOOLEAN NOT NULL DEFAULT FALSE,
          terms_version TEXT,
          privacy_version TEXT,
          terms_accepted_at BIGINT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;
      await sql`ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS share_name_allowed BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS terms_version TEXT`;
      await sql`ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS privacy_version TEXT`;
      await sql`ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS terms_accepted_at BIGINT`;
      await sql`CREATE INDEX IF NOT EXISTS player_accounts_updated_at_idx ON player_accounts (updated_at DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS player_game_results (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          game_type TEXT NOT NULL,
          finished_at BIGINT NOT NULL,
          result JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS player_game_results_player_finished_idx ON player_game_results (player_id, finished_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS player_game_results_player_game_finished_idx ON player_game_results (player_id, game_type, finished_at DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS site_admin_accounts (
          email TEXT PRIMARY KEY,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          receive_alerts BOOLEAN NOT NULL DEFAULT FALSE,
          receive_contacts BOOLEAN NOT NULL DEFAULT FALSE,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;
      await sql`ALTER TABLE site_admin_accounts ADD COLUMN IF NOT EXISTS receive_alerts BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE site_admin_accounts ADD COLUMN IF NOT EXISTS receive_contacts BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`CREATE INDEX IF NOT EXISTS site_admin_accounts_updated_at_idx ON site_admin_accounts (updated_at DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS site_admin_passkeys (
          credential_id TEXT PRIMARY KEY,
          admin_email TEXT NOT NULL REFERENCES site_admin_accounts(email) ON DELETE CASCADE,
          public_key TEXT NOT NULL,
          counter BIGINT NOT NULL DEFAULT 0,
          transports JSONB NOT NULL DEFAULT '[]'::jsonb,
          device_type TEXT NOT NULL,
          backed_up BOOLEAN NOT NULL DEFAULT FALSE,
          created_at BIGINT NOT NULL,
          last_used_at BIGINT
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS site_admin_passkeys_email_idx ON site_admin_passkeys (admin_email, created_at ASC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS site_admin_recovery_codes (
          code_hash TEXT PRIMARY KEY,
          admin_email TEXT NOT NULL REFERENCES site_admin_accounts(email) ON DELETE CASCADE,
          created_at BIGINT NOT NULL,
          used_at BIGINT
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS site_admin_recovery_codes_email_idx ON site_admin_recovery_codes (admin_email, used_at)`;
      await sql`
        CREATE TABLE IF NOT EXISTS site_admin_audit_logs (
          id TEXT PRIMARY KEY,
          actor_email TEXT,
          auth_method TEXT NOT NULL,
          action TEXT NOT NULL,
          target TEXT NOT NULL,
          before_value JSONB,
          after_value JSONB,
          request_fingerprint TEXT,
          created_at BIGINT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS site_admin_audit_logs_created_idx ON site_admin_audit_logs (created_at DESC)`;
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}
