CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE vocabulary_status AS ENUM ('draft', 'reviewed', 'active', 'rejected', 'archived');
CREATE TYPE vocabulary_source_type AS ENUM ('dictionary', 'manual', 'ai', 'user', 'import');
CREATE TYPE vocabulary_source_environment AS ENUM ('development', 'production', 'batch', 'admin');

CREATE TABLE words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surface TEXT NOT NULL,
  reading TEXT,
  normalized_surface TEXT NOT NULL,
  part_of_speech TEXT,
  proper_noun BOOLEAN NOT NULL DEFAULT FALSE,
  character_count INTEGER NOT NULL CHECK (character_count > 0),
  zipf DOUBLE PRECISION CHECK (zipf IS NULL OR zipf BETWEEN 0 AND 10),
  source_name TEXT,
  license_info TEXT,
  embedding VECTOR,
  status vocabulary_status NOT NULL DEFAULT 'draft',
  source_type vocabulary_source_type NOT NULL,
  source_environment vocabulary_source_environment NOT NULL,
  source_reference TEXT,
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  generation_batch_id UUID,
  created_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX words_normalized_reading_unique_idx ON words(normalized_surface, COALESCE(reading, ''));

CREATE TABLE word_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID NOT NULL REFERENCES words(id),
  short_definition TEXT NOT NULL CHECK (char_length(short_definition) BETWEEN 1 AND 500),
  source_name TEXT,
  display_game_id TEXT,
  status vocabulary_status NOT NULL DEFAULT 'draft',
  source_type vocabulary_source_type NOT NULL,
  source_environment vocabulary_source_environment NOT NULL,
  source_reference TEXT, provider TEXT, model TEXT, prompt_version TEXT,
  generation_batch_id UUID, created_by TEXT, reviewed_at TIMESTAMPTZ, reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE word_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_a_id UUID NOT NULL REFERENCES words(id),
  word_b_id UUID NOT NULL REFERENCES words(id),
  relation TEXT, category TEXT, similarity DOUBLE PRECISION, difficulty TEXT,
  embedding_similarity DOUBLE PRECISION,
  status vocabulary_status NOT NULL DEFAULT 'draft',
  source_type vocabulary_source_type NOT NULL,
  source_environment vocabulary_source_environment NOT NULL,
  source_reference TEXT, provider TEXT, model TEXT, prompt_version TEXT,
  generation_batch_id UUID, created_by TEXT, reviewed_at TIMESTAMPTZ, reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (word_a_id < word_b_id), UNIQUE (word_a_id, word_b_id)
);

CREATE TABLE word_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), theme TEXT NOT NULL, relation TEXT,
  difficulty TEXT, status vocabulary_status NOT NULL DEFAULT 'draft',
  source_type vocabulary_source_type NOT NULL, source_environment vocabulary_source_environment NOT NULL,
  source_reference TEXT, provider TEXT, model TEXT, prompt_version TEXT,
  generation_batch_id UUID, created_by TEXT, reviewed_at TIMESTAMPTZ, reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE word_group_members (
  group_id UUID NOT NULL REFERENCES word_groups(id) ON DELETE CASCADE,
  word_id UUID NOT NULL REFERENCES words(id), position INTEGER NOT NULL,
  is_odd_candidate BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (group_id, word_id)
);

CREATE TABLE word_game_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL, game_id TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT FALSE,
  difficulty TEXT, age_restriction TEXT, expression_restriction TEXT, reason TEXT,
  valid_from TIMESTAMPTZ, valid_until TIMESTAMPTZ, manually_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subject_type, subject_id, game_id)
);

CREATE TABLE vocabulary_quality_stats (
  subject_type TEXT NOT NULL, subject_id UUID NOT NULL,
  production_good_count BIGINT NOT NULL DEFAULT 0, production_bad_count BIGINT NOT NULL DEFAULT 0,
  adoption_count BIGINT NOT NULL DEFAULT 0, incident_count BIGINT NOT NULL DEFAULT 0,
  manual_quality_score DOUBLE PRECISION, last_aggregated_at TIMESTAMPTZ,
  PRIMARY KEY (subject_type, subject_id)
);

CREATE INDEX words_status_idx ON words(status);
CREATE INDEX eligibility_game_enabled_idx ON word_game_eligibility(game_id, enabled) WHERE NOT manually_suspended;
CREATE INDEX definitions_word_status_idx ON word_definitions(word_id, status);
CREATE INDEX pairs_status_idx ON word_pairs(status);

CREATE VIEW active_words AS SELECT * FROM words WHERE status = 'active';
CREATE VIEW active_word_definitions AS SELECT * FROM word_definitions WHERE status = 'active';
CREATE VIEW active_word_pairs AS SELECT * FROM word_pairs WHERE status = 'active';
CREATE VIEW active_word_groups AS SELECT * FROM word_groups WHERE status = 'active';
CREATE VIEW active_word_group_members AS
  SELECT member.* FROM word_group_members member
  JOIN word_groups parent_group ON parent_group.id = member.group_id
  WHERE parent_group.status = 'active';
CREATE VIEW active_word_game_eligibility AS
  SELECT * FROM word_game_eligibility WHERE enabled AND NOT manually_suspended;
