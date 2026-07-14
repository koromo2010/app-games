import { ensurePostgresSchema } from "./postgres-schema.ts";
import { getPostgresClient } from "./postgres-store.ts";

/**
 * The lexical master is deliberately separate from room state.
 * Tables are created only by explicit import/initialization commands; normal
 * gameplay continues to use the current stores until a later migration.
 */
let wordMasterSchemaPromise: Promise<void> | null = null;

export async function ensureWordMasterSchema() {
  if (!wordMasterSchemaPromise) {
    wordMasterSchemaPromise = (async () => {
      await ensurePostgresSchema();
      const sql = getPostgresClient();

      // Neon supports pgvector. Keeping the dimension unspecified lets the
      // embedding model be chosen once before an ANN index is added.
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;

      await sql`
        CREATE TABLE IF NOT EXISTS word_sources (
          id BIGSERIAL PRIMARY KEY,
          source_key TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          source_version TEXT NOT NULL,
          license TEXT NOT NULL,
          attribution TEXT NOT NULL,
          source_url TEXT NOT NULL,
          import_notes TEXT NOT NULL DEFAULT '',
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS words (
          id BIGSERIAL PRIMARY KEY,
          surface TEXT NOT NULL,
          normalized_form TEXT NOT NULL,
          reading TEXT NOT NULL DEFAULT '',
          primary_part_of_speech TEXT NOT NULL,
          part_of_speech_details TEXT[] NOT NULL DEFAULT '{}',
          proper_noun_status TEXT NOT NULL DEFAULT 'ambiguous'
            CHECK (proper_noun_status IN ('common', 'proper', 'ambiguous')),
          proper_noun_type TEXT
            CHECK (proper_noun_type IS NULL OR proper_noun_type IN ('person', 'place', 'organization', 'other')),
          zipf_frequency REAL,
          embedding VECTOR,
          embedding_model TEXT,
          random_key DOUBLE PRECISION NOT NULL DEFAULT random()
            CHECK (random_key >= 0 AND random_key < 1),
          source_id BIGINT NOT NULL REFERENCES word_sources(id) ON DELETE RESTRICT,
          source_entry_id TEXT NOT NULL,
          source_version TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (source_id, source_entry_id),
          UNIQUE (normalized_form, reading, primary_part_of_speech, source_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS game_word_settings (
          word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          game_type TEXT NOT NULL CHECK (game_type IN ('wordwolf', 'nigoichi', 'tahoiya')),
          usable BOOLEAN NOT NULL DEFAULT FALSE,
          difficulty TEXT CHECK (difficulty IS NULL OR difficulty IN ('easy', 'normal', 'hard')),
          review_status TEXT NOT NULL DEFAULT 'unreviewed'
            CHECK (review_status IN ('unreviewed', 'auto', 'approved', 'review', 'disabled')),
          feedback_count INTEGER NOT NULL DEFAULT 0 CHECK (feedback_count >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (word_id, game_type)
        )
      `;

      // Stored definitions must identify whether the text itself may be shown.
      // Defaulting to a paraphrase prevents accidental dictionary-text reuse.
      await sql`
        CREATE TABLE IF NOT EXISTS word_definitions (
          id BIGSERIAL PRIMARY KEY,
          word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          definition TEXT NOT NULL,
          text_kind TEXT NOT NULL DEFAULT 'paraphrase'
            CHECK (text_kind IN ('paraphrase', 'licensed_quote', 'source_summary')),
          source_name TEXT NOT NULL,
          source_url TEXT NOT NULL,
          source_version TEXT NOT NULL DEFAULT '',
          license TEXT NOT NULL,
          source_entry_id TEXT NOT NULL DEFAULT '',
          verified BOOLEAN NOT NULL DEFAULT FALSE,
          verified_at TIMESTAMPTZ,
          verified_by TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (word_id, source_name, source_entry_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS word_db_policies (
          policy_key TEXT PRIMARY KEY,
          policy_value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        INSERT INTO word_db_policies (policy_key, policy_value)
        VALUES (
          'zipf-game-classification-v1',
          '{"version":1,"wordwolf":{"easy_min":4.5,"normal_min":3.5,"hard_min":2.5},"nigoichi":{"easy_min":4.5,"normal_min":3.5,"hard_min":2.5},"tahoiya":{"easy_max":3.5,"normal_min":1.0,"normal_max":2.5,"hard_max":1.0,"zero_requires_verified_definition":true}}'::jsonb
        )
        ON CONFLICT (policy_key) DO NOTHING
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS user_seen_tahoiya_words (
          user_id TEXT NOT NULL REFERENCES player_accounts(player_id) ON DELETE CASCADE,
          word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          seen_count INTEGER NOT NULL DEFAULT 1 CHECK (seen_count > 0),
          PRIMARY KEY (user_id, word_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS word_feedback (
          id BIGSERIAL PRIMARY KEY,
          word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          game_type TEXT NOT NULL CHECK (game_type IN ('wordwolf', 'nigoichi', 'tahoiya')),
          user_id TEXT REFERENCES player_accounts(player_id) ON DELETE SET NULL,
          rating_type TEXT NOT NULL
            CHECK (rating_type IN ('too_easy', 'too_hard', 'unsuitable', 'incorrect', 'inappropriate', 'good', 'other')),
          comment TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS word_classification_history (
          id BIGSERIAL PRIMARY KEY,
          word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          game_type TEXT NOT NULL CHECK (game_type IN ('wordwolf', 'nigoichi', 'tahoiya')),
          previous_difficulty TEXT,
          new_difficulty TEXT,
          previous_usable BOOLEAN,
          new_usable BOOLEAN,
          reason TEXT NOT NULL,
          feedback_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS wordwolf_pairs (
          id BIGSERIAL PRIMARY KEY,
          word_low_id BIGINT NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
          word_high_id BIGINT NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
          similarity REAL,
          suitability REAL,
          difficulty TEXT CHECK (difficulty IS NULL OR difficulty IN ('easy', 'normal', 'hard')),
          status TEXT NOT NULL DEFAULT 'candidate'
            CHECK (status IN ('candidate', 'approved', 'review', 'disabled')),
          generation_method TEXT NOT NULL,
          generation_model TEXT,
          prompt_version TEXT,
          play_count INTEGER NOT NULL DEFAULT 0 CHECK (play_count >= 0),
          positive_count INTEGER NOT NULL DEFAULT 0 CHECK (positive_count >= 0),
          negative_count INTEGER NOT NULL DEFAULT 0 CHECK (negative_count >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (word_low_id < word_high_id),
          UNIQUE (word_low_id, word_high_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS wordwolf_pair_feedback (
          id BIGSERIAL PRIMARY KEY,
          pair_id BIGINT NOT NULL REFERENCES wordwolf_pairs(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES player_accounts(player_id) ON DELETE SET NULL,
          evaluation TEXT NOT NULL CHECK (evaluation IN ('good', 'bad')),
          reason TEXT NOT NULL
            CHECK (reason IN ('too_similar', 'too_different', 'containment', 'one_side_too_difficult', 'obvious', 'conversation_did_not_expand', 'inappropriate', 'other')),
          comment TEXT NOT NULL DEFAULT '',
          player_count SMALLINT CHECK (player_count IS NULL OR player_count >= 2),
          wolf_count SMALLINT CHECK (wolf_count IS NULL OR wolf_count >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS words_random_key_idx ON words (random_key)`;
      await sql`CREATE INDEX IF NOT EXISTS words_active_source_idx ON words (source_id, active, id)`;
      await sql`CREATE INDEX IF NOT EXISTS words_normalized_form_idx ON words (normalized_form)`;
      await sql`CREATE INDEX IF NOT EXISTS game_word_settings_select_idx ON game_word_settings (game_type, difficulty, word_id) WHERE usable`;
      await sql`CREATE INDEX IF NOT EXISTS word_definitions_verified_idx ON word_definitions (word_id) WHERE verified AND active`;
      await sql`CREATE INDEX IF NOT EXISTS tahoiya_seen_word_user_date_idx ON user_seen_tahoiya_words (word_id, user_id, last_seen_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS word_feedback_word_game_idx ON word_feedback (word_id, game_type, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS wordwolf_pairs_status_difficulty_idx ON wordwolf_pairs (status, difficulty, id) WHERE status = 'approved'`;
      await sql`CREATE INDEX IF NOT EXISTS wordwolf_pair_feedback_pair_idx ON wordwolf_pair_feedback (pair_id, created_at DESC)`;
    })().catch((error) => {
      wordMasterSchemaPromise = null;
      throw error;
    });
  }
  return wordMasterSchemaPromise;
}
