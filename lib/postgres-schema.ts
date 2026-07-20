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
          locale TEXT NOT NULL DEFAULT 'ja',
          terms_version TEXT,
          privacy_version TEXT,
          terms_accepted_at BIGINT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;
      await sql`ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS share_name_allowed BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE player_accounts ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'ja'`;
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
        CREATE TABLE IF NOT EXISTS game_duration_samples (
          id TEXT PRIMARY KEY,
          game_type TEXT NOT NULL,
          started_at BIGINT NOT NULL,
          finished_at BIGINT NOT NULL,
          duration_seconds INTEGER NOT NULL,
          player_count INTEGER NOT NULL,
          variant_key TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS game_duration_samples_game_finished_idx ON game_duration_samples (game_type, finished_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS game_duration_samples_game_players_finished_idx ON game_duration_samples (game_type, player_count, finished_at DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS tahoiya_decoy_candidates (
          id TEXT PRIMARY KEY,
          word TEXT NOT NULL,
          normalized_word TEXT NOT NULL,
          reading TEXT,
          real_definition TEXT NOT NULL,
          real_definition_hash TEXT NOT NULL,
          definition_text TEXT NOT NULL,
          normalized_definition TEXT NOT NULL,
          definition_hash TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (status IN (
            'unreviewed', 'eligible', 'excluded_same_as_answer', 'review_uncertain',
            'archived_zero_votes', 'archived_low_votes', 'rejected_moderation'
          )),
          multiplayer_votes BIGINT NOT NULL DEFAULT 0 CHECK (multiplayer_votes >= 0),
          multiplayer_appearances BIGINT NOT NULL DEFAULT 0 CHECK (multiplayer_appearances >= 0),
          multiplayer_vote_opportunities BIGINT NOT NULL DEFAULT 0 CHECK (multiplayer_vote_opportunities >= 0),
          solo_votes BIGINT NOT NULL DEFAULT 0 CHECK (solo_votes >= 0),
          solo_appearances BIGINT NOT NULL DEFAULT 0 CHECK (solo_appearances >= 0),
          reviewed_real_definition_hash TEXT,
          review_label TEXT CHECK (review_label IS NULL OR review_label IN ('different', 'same', 'uncertain')),
          review_prompt_version TEXT,
          reviewed_at BIGINT,
          first_seen_at BIGINT NOT NULL,
          last_seen_at BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (normalized_word, definition_hash)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS tahoiya_decoy_candidate_events (
          id TEXT PRIMARY KEY,
          candidate_id TEXT NOT NULL REFERENCES tahoiya_decoy_candidates(id) ON DELETE RESTRICT,
          source_kind TEXT NOT NULL CHECK (source_kind IN ('multiplayer_round', 'legacy_replay', 'solo_choice')),
          votes_awarded INTEGER NOT NULL DEFAULT 0 CHECK (votes_awarded >= 0),
          voter_opportunities INTEGER NOT NULL DEFAULT 0 CHECK (voter_opportunities >= 0),
          appearances INTEGER NOT NULL DEFAULT 1 CHECK (appearances >= 0),
          occurred_at BIGINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS tahoiya_decoy_candidates_word_status_idx ON tahoiya_decoy_candidates (normalized_word, status)`;
      await sql`CREATE INDEX IF NOT EXISTS tahoiya_decoy_candidates_votes_idx ON tahoiya_decoy_candidates (normalized_word, (multiplayer_votes + solo_votes) DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS tahoiya_decoy_candidate_events_candidate_idx ON tahoiya_decoy_candidate_events (candidate_id, occurred_at DESC)`;
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
        CREATE TABLE IF NOT EXISTS player_debug_access_grants (
          player_id TEXT PRIMARY KEY REFERENCES player_accounts(player_id) ON DELETE CASCADE,
          granted_by_email TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS player_debug_access_grants_updated_at_idx ON player_debug_access_grants (updated_at DESC)`;
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
