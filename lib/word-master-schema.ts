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
          form_status TEXT NOT NULL DEFAULT 'unknown'
            CHECK (form_status IN ('dictionary', 'inflected', 'non_inflecting', 'unknown')),
          form_classification_reason TEXT NOT NULL DEFAULT '',
          form_policy_version TEXT NOT NULL DEFAULT '',
          proper_noun_status TEXT NOT NULL DEFAULT 'ambiguous'
            CHECK (proper_noun_status IN ('common', 'proper', 'ambiguous')),
          proper_noun_type TEXT
            CHECK (proper_noun_type IS NULL OR proper_noun_type IN ('person', 'place', 'organization', 'other')),
          person_name_status TEXT NOT NULL DEFAULT 'not_person'
            CHECK (person_name_status IN ('not_person', 'surname_only', 'given_name_only', 'name_only', 'general_person', 'unknown')),
          is_name_fragment BOOLEAN NOT NULL DEFAULT FALSE,
          person_name_policy_version TEXT NOT NULL DEFAULT '',
          surface_quality_status TEXT NOT NULL DEFAULT 'unknown'
            CHECK (surface_quality_status IN ('clean', 'review', 'exclude', 'unknown')),
          surface_quality_flags TEXT[] NOT NULL DEFAULT '{}',
          surface_quality_policy_version TEXT NOT NULL DEFAULT '',
          content_safety_status TEXT NOT NULL DEFAULT 'unreviewed'
            CHECK (content_safety_status IN ('unreviewed', 'clean', 'review', 'exclude')),
          content_safety_flags TEXT[] NOT NULL DEFAULT '{}',
          content_safety_policy_version TEXT NOT NULL DEFAULT '',
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

      // Existing databases predate lexical-form classification. Additive
      // migration keeps source rows intact; the importer backfills the values.
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS form_status TEXT NOT NULL DEFAULT 'unknown'
      `;
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS form_classification_reason TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS form_policy_version TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        DO $word_form_constraint$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'words_form_status_check'
          ) THEN
            ALTER TABLE words
            ADD CONSTRAINT words_form_status_check
            CHECK (form_status IN ('dictionary', 'inflected', 'non_inflecting', 'unknown'));
          END IF;
        END
        $word_form_constraint$
      `;

      // Sudachi's person-name subtype distinguishes standalone person entries
      // from surname/given-name fragments. Existing rows are backfilled by the
      // importer, while uncertain metadata remains available for review.
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS person_name_status TEXT NOT NULL DEFAULT 'not_person'
      `;
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS is_name_fragment BOOLEAN NOT NULL DEFAULT FALSE
      `;
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS person_name_policy_version TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        DO $person_name_constraint$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'words_person_name_status_check'
              AND pg_get_constraintdef(oid) NOT LIKE '%''name_only''::text%'
          ) THEN
            ALTER TABLE words DROP CONSTRAINT words_person_name_status_check;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'words_person_name_status_check'
          ) THEN
            ALTER TABLE words
            ADD CONSTRAINT words_person_name_status_check
            CHECK (person_name_status IN ('not_person', 'surname_only', 'given_name_only', 'name_only', 'general_person', 'unknown'));
          END IF;
        END
        $person_name_constraint$
      `;

      // Surface-level quality flags retain difficult and archaic dictionary
      // words while separating facilities, enumerations, and obvious noise.
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS surface_quality_status TEXT NOT NULL DEFAULT 'unknown'
      `;
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS surface_quality_flags TEXT[] NOT NULL DEFAULT '{}'
      `;
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS surface_quality_policy_version TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        DO $surface_quality_constraint$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'words_surface_quality_status_check'
          ) THEN
            ALTER TABLE words
            ADD CONSTRAINT words_surface_quality_status_check
            CHECK (surface_quality_status IN ('clean', 'review', 'exclude', 'unknown'));
          END IF;
        END
        $surface_quality_constraint$
      `;

      // Deterministic exact matches reject obvious standalone sensitive words.
      // Everything else remains unreviewed until the same LLM request that
      // generates a Wordwolf partner also makes the safety decision.
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS content_safety_status TEXT NOT NULL DEFAULT 'unreviewed'
      `;
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS content_safety_flags TEXT[] NOT NULL DEFAULT '{}'
      `;
      await sql`
        ALTER TABLE words
        ADD COLUMN IF NOT EXISTS content_safety_policy_version TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        DO $content_safety_constraint$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'words_content_safety_status_check'
          ) THEN
            ALTER TABLE words
            ADD CONSTRAINT words_content_safety_status_check
            CHECK (content_safety_status IN ('unreviewed', 'clean', 'review', 'exclude'));
          END IF;
        END
        $content_safety_constraint$
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
        CREATE TABLE IF NOT EXISTS person_entities (
          id BIGSERIAL PRIMARY KEY,
          wikidata_entity_id TEXT NOT NULL UNIQUE
            CHECK (wikidata_entity_id ~ '^Q[1-9][0-9]*$'),
          canonical_name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          wikipedia_url TEXT NOT NULL DEFAULT '',
          sitelink_count INTEGER NOT NULL DEFAULT 0 CHECK (sitelink_count >= 0),
          source_version TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS word_person_entity_links (
          word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
          person_entity_id BIGINT NOT NULL REFERENCES person_entities(id) ON DELETE CASCADE,
          name_role TEXT NOT NULL
            CHECK (name_role IN ('full_name', 'surname', 'given_name', 'name_fragment', 'alias')),
          confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
          match_method TEXT NOT NULL,
          source_version TEXT NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (word_id, person_entity_id, name_role)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS word_db_policies (
          policy_key TEXT PRIMARY KEY,
          policy_value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      // AI-generated general words stay in a local candidate area until a
      // separate review assigns difficulty and promotes them to the master.
      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_categories (
          category_key TEXT PRIMARY KEY,
          display_name TEXT NOT NULL UNIQUE,
          sort_order SMALLINT NOT NULL UNIQUE CHECK (sort_order > 0),
          target_count SMALLINT NOT NULL DEFAULT 30 CHECK (target_count > 0),
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_generation_batches (
          id BIGSERIAL PRIMARY KEY,
          batch_key TEXT NOT NULL UNIQUE,
          generated_by TEXT NOT NULL,
          model TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          input_checksum TEXT NOT NULL,
          category_keys TEXT[] NOT NULL,
          status TEXT NOT NULL DEFAULT 'importing'
            CHECK (status IN ('importing', 'completed', 'partial', 'failed')),
          requested_count INTEGER NOT NULL DEFAULT 0 CHECK (requested_count >= 0),
          inserted_count INTEGER NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
          duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
          invalid_count INTEGER NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
          error_message TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_candidates (
          id BIGSERIAL PRIMARY KEY,
          surface TEXT NOT NULL,
          normalized_form TEXT NOT NULL UNIQUE,
          reading TEXT NOT NULL,
          category_key TEXT NOT NULL REFERENCES ai_word_categories(category_key) ON DELETE RESTRICT,
          generation_batch_id BIGINT NOT NULL REFERENCES ai_word_generation_batches(id) ON DELETE RESTRICT,
          source_type TEXT NOT NULL DEFAULT 'ai_generated'
            CHECK (source_type = 'ai_generated'),
          review_status TEXT NOT NULL DEFAULT 'generated'
            CHECK (review_status IN ('generated', 'review', 'classified', 'approved', 'rejected', 'promoted')),
          quality_status TEXT NOT NULL DEFAULT 'unreviewed'
            CHECK (quality_status IN ('unreviewed', 'approved', 'review', 'rejected')),
          quality_flags TEXT[] NOT NULL DEFAULT '{}',
          quality_reason TEXT NOT NULL DEFAULT '',
          quality_reviewed_by TEXT NOT NULL DEFAULT '',
          quality_review_model TEXT NOT NULL DEFAULT '',
          quality_policy_version TEXT NOT NULL DEFAULT '',
          quality_reviewed_at TIMESTAMPTZ,
          difficulty TEXT
            CHECK (difficulty IS NULL OR difficulty IN ('easy', 'normal', 'hard')),
          classification_confidence REAL
            CHECK (classification_confidence IS NULL OR (classification_confidence >= 0 AND classification_confidence <= 1)),
          classification_reason TEXT NOT NULL DEFAULT '',
          matched_word_id BIGINT REFERENCES words(id) ON DELETE RESTRICT,
          promoted_word_id BIGINT REFERENCES words(id) ON DELETE RESTRICT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;

      await sql`
        ALTER TABLE ai_word_candidates
        ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'unreviewed'
      `;
      await sql`
        ALTER TABLE ai_word_candidates
        ADD COLUMN IF NOT EXISTS quality_flags TEXT[] NOT NULL DEFAULT '{}'
      `;
      await sql`
        ALTER TABLE ai_word_candidates
        ADD COLUMN IF NOT EXISTS quality_reason TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        ALTER TABLE ai_word_candidates
        ADD COLUMN IF NOT EXISTS quality_reviewed_by TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        ALTER TABLE ai_word_candidates
        ADD COLUMN IF NOT EXISTS quality_review_model TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        ALTER TABLE ai_word_candidates
        ADD COLUMN IF NOT EXISTS quality_policy_version TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        ALTER TABLE ai_word_candidates
        ADD COLUMN IF NOT EXISTS quality_reviewed_at TIMESTAMPTZ
      `;
      await sql`
        DO $ai_word_candidate_constraints$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ai_word_candidates_review_status_check'
              AND pg_get_constraintdef(oid) NOT LIKE '%''review''::text%'
          ) THEN
            ALTER TABLE ai_word_candidates DROP CONSTRAINT ai_word_candidates_review_status_check;
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'ai_word_candidates_review_status_check'
          ) THEN
            ALTER TABLE ai_word_candidates
            ADD CONSTRAINT ai_word_candidates_review_status_check
            CHECK (review_status IN ('generated', 'review', 'classified', 'approved', 'rejected', 'promoted'));
          END IF;
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'ai_word_candidates_quality_status_check'
          ) THEN
            ALTER TABLE ai_word_candidates
            ADD CONSTRAINT ai_word_candidates_quality_status_check
            CHECK (quality_status IN ('unreviewed', 'approved', 'review', 'rejected'));
          END IF;
        END
        $ai_word_candidate_constraints$
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_quality_review_batches (
          id BIGSERIAL PRIMARY KEY,
          review_key TEXT NOT NULL UNIQUE,
          reviewed_by TEXT NOT NULL,
          model TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          input_checksum TEXT NOT NULL,
          category_keys TEXT[] NOT NULL,
          status TEXT NOT NULL DEFAULT 'reviewing'
            CHECK (status IN ('reviewing', 'completed', 'failed')),
          approved_count INTEGER NOT NULL DEFAULT 0 CHECK (approved_count >= 0),
          review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
          rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
          error_message TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_candidate_quality_reviews (
          id BIGSERIAL PRIMARY KEY,
          candidate_id BIGINT NOT NULL REFERENCES ai_word_candidates(id) ON DELETE RESTRICT,
          review_batch_id BIGINT NOT NULL REFERENCES ai_word_quality_review_batches(id) ON DELETE RESTRICT,
          decision TEXT NOT NULL CHECK (decision IN ('approved', 'review', 'rejected')),
          flags TEXT[] NOT NULL DEFAULT '{}',
          reason TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (candidate_id, review_batch_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_classification_batches (
          id BIGSERIAL PRIMARY KEY,
          classification_key TEXT NOT NULL UNIQUE,
          classified_by TEXT NOT NULL,
          model TEXT NOT NULL,
          rubric_version TEXT NOT NULL,
          input_checksum TEXT NOT NULL,
          category_keys TEXT[] NOT NULL,
          status TEXT NOT NULL DEFAULT 'classifying'
            CHECK (status IN ('classifying', 'completed', 'failed')),
          easy_count INTEGER NOT NULL DEFAULT 0 CHECK (easy_count >= 0),
          normal_count INTEGER NOT NULL DEFAULT 0 CHECK (normal_count >= 0),
          hard_count INTEGER NOT NULL DEFAULT 0 CHECK (hard_count >= 0),
          error_message TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_candidate_classifications (
          id BIGSERIAL PRIMARY KEY,
          candidate_id BIGINT NOT NULL REFERENCES ai_word_candidates(id) ON DELETE RESTRICT,
          classification_batch_id BIGINT NOT NULL REFERENCES ai_word_classification_batches(id) ON DELETE RESTRICT,
          difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
          confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
          reason TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (candidate_id, classification_batch_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_correction_batches (
          id BIGSERIAL PRIMARY KEY,
          correction_key TEXT NOT NULL UNIQUE,
          corrected_by TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          input_checksum TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'applying'
            CHECK (status IN ('applying', 'completed', 'failed')),
          corrected_count INTEGER NOT NULL DEFAULT 0 CHECK (corrected_count >= 0),
          approved_count INTEGER NOT NULL DEFAULT 0 CHECK (approved_count >= 0),
          excluded_count INTEGER NOT NULL DEFAULT 0 CHECK (excluded_count >= 0),
          error_message TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_candidate_corrections (
          id BIGSERIAL PRIMARY KEY,
          candidate_id BIGINT NOT NULL REFERENCES ai_word_candidates(id) ON DELETE RESTRICT,
          correction_batch_id BIGINT NOT NULL REFERENCES ai_word_correction_batches(id) ON DELETE RESTRICT,
          action TEXT NOT NULL CHECK (action IN ('replace_surface', 'approve', 'exclude')),
          old_surface TEXT NOT NULL,
          old_normalized_form TEXT NOT NULL,
          new_surface TEXT,
          new_normalized_form TEXT,
          reason TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (candidate_id, correction_batch_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_enrichment_batches (
          id BIGSERIAL PRIMARY KEY,
          enrichment_key TEXT NOT NULL UNIQUE,
          enriched_by TEXT NOT NULL,
          model TEXT NOT NULL,
          policy_version TEXT NOT NULL,
          lexical_source_version TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'enriching'
            CHECK (status IN ('enriching', 'completed', 'failed')),
          expected_count INTEGER NOT NULL CHECK (expected_count >= 0),
          enriched_count INTEGER NOT NULL DEFAULT 0 CHECK (enriched_count >= 0),
          error_message TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS ai_word_candidate_enrichments (
          id BIGSERIAL PRIMARY KEY,
          candidate_id BIGINT NOT NULL REFERENCES ai_word_candidates(id) ON DELETE RESTRICT,
          word_id BIGINT NOT NULL REFERENCES words(id) ON DELETE RESTRICT,
          enrichment_batch_id BIGINT NOT NULL REFERENCES ai_word_enrichment_batches(id) ON DELETE RESTRICT,
          enrichment_method TEXT NOT NULL
            CHECK (enrichment_method IN ('lexical_surface_variant', 'ai_category_review')),
          lexical_source_key TEXT NOT NULL DEFAULT '',
          primary_part_of_speech TEXT NOT NULL,
          part_of_speech_details TEXT[] NOT NULL,
          form_status TEXT NOT NULL
            CHECK (form_status IN ('dictionary', 'inflected', 'non_inflecting', 'unknown')),
          proper_noun_status TEXT NOT NULL
            CHECK (proper_noun_status IN ('common', 'proper', 'ambiguous')),
          proper_noun_type TEXT
            CHECK (proper_noun_type IS NULL OR proper_noun_type IN ('person', 'place', 'organization', 'other')),
          person_name_status TEXT NOT NULL
            CHECK (person_name_status IN ('not_person', 'surname_only', 'given_name_only', 'name_only', 'general_person', 'unknown')),
          surface_quality_status TEXT NOT NULL
            CHECK (surface_quality_status IN ('clean', 'review', 'exclude', 'unknown')),
          surface_quality_flags TEXT[] NOT NULL DEFAULT '{}',
          content_safety_status TEXT NOT NULL
            CHECK (content_safety_status IN ('unreviewed', 'clean', 'review', 'exclude')),
          content_safety_flags TEXT[] NOT NULL DEFAULT '{}',
          confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
          semantic_note TEXT NOT NULL DEFAULT '',
          reason TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (candidate_id, enrichment_batch_id)
        )
      `;
      await sql`
        ALTER TABLE ai_word_candidate_enrichments
        ADD COLUMN IF NOT EXISTS lexical_source_key TEXT NOT NULL DEFAULT ''
      `;
      await sql`
        DO $ai_word_enrichment_method_constraint$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ai_word_candidate_enrichments_enrichment_method_check'
              AND pg_get_constraintdef(oid) NOT LIKE '%lexical_surface_variant%'
          ) THEN
            ALTER TABLE ai_word_candidate_enrichments
            DROP CONSTRAINT ai_word_candidate_enrichments_enrichment_method_check;
          END IF;
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'ai_word_candidate_enrichments_enrichment_method_check'
          ) THEN
            ALTER TABLE ai_word_candidate_enrichments
            ADD CONSTRAINT ai_word_candidate_enrichments_enrichment_method_check
            CHECK (enrichment_method IN (
              'sudachidict_surface_variant',
              'lexical_surface_variant',
              'ai_category_review'
            ));
          END IF;
        END
        $ai_word_enrichment_method_constraint$
      `;
      await sql`
        UPDATE ai_word_candidate_enrichments
        SET enrichment_method = 'lexical_surface_variant',
            reason = '固定版SudachiDict Coreを優先し、同一表記・読み違いの一意な普通名詞行を参照。存在しない場合はローカルJMdictで補完'
        WHERE enrichment_method = 'sudachidict_surface_variant'
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
      await sql`CREATE INDEX IF NOT EXISTS words_form_status_idx ON words (form_status, id)`;
      await sql`CREATE INDEX IF NOT EXISTS words_person_name_status_idx ON words (person_name_status, id)`;
      await sql`CREATE INDEX IF NOT EXISTS words_surface_quality_status_idx ON words (surface_quality_status, id)`;
      await sql`CREATE INDEX IF NOT EXISTS words_content_safety_status_idx ON words (content_safety_status, id)`;

      await sql`CREATE INDEX IF NOT EXISTS words_random_key_idx ON words (random_key)`;
      await sql`CREATE INDEX IF NOT EXISTS words_active_source_idx ON words (source_id, active, id)`;
      await sql`CREATE INDEX IF NOT EXISTS words_normalized_form_idx ON words (normalized_form)`;
      await sql`CREATE INDEX IF NOT EXISTS ai_word_candidates_category_status_idx ON ai_word_candidates (category_key, review_status, id)`;
      await sql`CREATE INDEX IF NOT EXISTS ai_word_candidates_quality_status_idx ON ai_word_candidates (quality_status, category_key, id)`;
      await sql`CREATE INDEX IF NOT EXISTS ai_word_candidate_quality_reviews_candidate_idx ON ai_word_candidate_quality_reviews (candidate_id, id)`;
      await sql`CREATE INDEX IF NOT EXISTS ai_word_candidate_classifications_candidate_idx ON ai_word_candidate_classifications (candidate_id, id)`;
      await sql`CREATE INDEX IF NOT EXISTS ai_word_candidate_corrections_candidate_idx ON ai_word_candidate_corrections (candidate_id, id)`;
      await sql`CREATE INDEX IF NOT EXISTS ai_word_candidate_enrichments_candidate_idx ON ai_word_candidate_enrichments (candidate_id, id)`;
      await sql`CREATE INDEX IF NOT EXISTS ai_word_candidates_difficulty_idx ON ai_word_candidates (difficulty, id) WHERE review_status IN ('classified', 'approved', 'promoted')`;
      await sql`CREATE INDEX IF NOT EXISTS game_word_settings_select_idx ON game_word_settings (game_type, difficulty, word_id) WHERE usable`;
      await sql`CREATE INDEX IF NOT EXISTS word_definitions_verified_idx ON word_definitions (word_id) WHERE verified AND active`;
      await sql`CREATE INDEX IF NOT EXISTS word_person_entity_links_entity_idx ON word_person_entity_links (person_entity_id, name_role, word_id) WHERE active`;
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
