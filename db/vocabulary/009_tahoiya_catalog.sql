-- Canonical Tahoiya topic catalog. Player experience remains in per-player Redis Sets.

CREATE TABLE IF NOT EXISTS tahoiya_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID NOT NULL UNIQUE REFERENCES words(id),
  definition_id UUID NOT NULL REFERENCES word_definitions(id),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'standard', 'extreme')),
  note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  source_detail TEXT NOT NULL DEFAULT '' CHECK (char_length(source_detail) <= 2000),
  source_kind TEXT NOT NULL DEFAULT 'llm' CHECK (source_kind IN ('llm', 'fallback')),
  genre TEXT CHECK (genre IS NULL OR char_length(genre) <= 200),
  source_library TEXT CHECK (source_library IS NULL OR char_length(source_library) <= 300),
  source_url TEXT CHECK (source_url IS NULL OR char_length(source_url) <= 2000),
  difficulty_reason TEXT CHECK (difficulty_reason IS NULL OR char_length(difficulty_reason) <= 1000),
  difficulty_judged_by TEXT CHECK (difficulty_judged_by IS NULL OR char_length(difficulty_judged_by) <= 200),
  difficulty_rubric_version TEXT CHECK (difficulty_rubric_version IS NULL OR char_length(difficulty_rubric_version) <= 200),
  feedback_anchor_tags TEXT[] NOT NULL DEFAULT '{}',
  difficulty_feedback_ids TEXT[] NOT NULL DEFAULT '{}',
  generation JSONB CHECK (
    generation IS NULL OR (
      jsonb_typeof(generation) = 'object'
      AND octet_length(generation::text) <= 20000
    )
  ),
  use_count BIGINT NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at TIMESTAMPTZ,
  status vocabulary_status NOT NULL DEFAULT 'active',
  source_type vocabulary_source_type NOT NULL,
  source_environment vocabulary_source_environment NOT NULL,
  source_reference TEXT,
  created_by TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tahoiya_topics_selection_idx
  ON tahoiya_topics(difficulty, use_count, last_used_at)
  WHERE status = 'active';

CREATE OR REPLACE VIEW active_tahoiya_topics AS
SELECT
  topic.id,
  topic.word_id,
  topic.definition_id,
  word.surface,
  word.reading,
  word.normalized_surface,
  definition.short_definition AS real_definition,
  topic.difficulty,
  topic.note,
  topic.source_detail,
  topic.source_kind,
  topic.genre,
  topic.source_library,
  topic.source_url,
  topic.difficulty_reason,
  topic.difficulty_judged_by,
  topic.difficulty_rubric_version,
  topic.feedback_anchor_tags,
  topic.difficulty_feedback_ids,
  topic.generation,
  topic.use_count,
  topic.last_used_at,
  topic.created_at,
  topic.updated_at
FROM tahoiya_topics topic
JOIN words word ON word.id = topic.word_id AND word.status = 'active'
JOIN word_definitions definition
  ON definition.id = topic.definition_id AND definition.status = 'active'
JOIN word_game_eligibility eligibility
  ON eligibility.subject_type = 'word'
  AND eligibility.subject_id = topic.word_id
  AND eligibility.game_id = 'tahoiya'
  AND eligibility.enabled
  AND NOT eligibility.manually_suspended
WHERE topic.status = 'active'
  AND (eligibility.valid_from IS NULL OR eligibility.valid_from <= NOW())
  AND (eligibility.valid_until IS NULL OR eligibility.valid_until > NOW());

CREATE OR REPLACE FUNCTION record_tahoiya_topic_usage(target_topic_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tahoiya_topics
  SET use_count = use_count + 1,
      last_used_at = NOW(),
      updated_at = NOW()
  WHERE id = target_topic_id AND status = 'active';
END $$;

REVOKE ALL ON tahoiya_topics FROM PUBLIC;
REVOKE ALL ON active_tahoiya_topics FROM PUBLIC;
REVOKE ALL ON FUNCTION record_tahoiya_topic_usage(UUID) FROM PUBLIC;

GRANT SELECT ON active_tahoiya_topics
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;
GRANT SELECT ON tahoiya_topics TO vocabulary_development, vocabulary_batch, vocabulary_admin;
GRANT INSERT, UPDATE ON tahoiya_topics TO vocabulary_admin;
GRANT EXECUTE ON FUNCTION record_tahoiya_topic_usage(UUID)
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;
