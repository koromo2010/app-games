-- Persist Tahoiya's LLM recognition screening separately from generated definitions.
-- The raw recognition estimate remains the source of truth; difficulty is derived
-- continuously as extreme <= 1%, standard > 1% and < 15%, otherwise rejected.

CREATE TABLE IF NOT EXISTS tahoiya_word_screenings (
  word_id UUID PRIMARY KEY REFERENCES words(id),
  estimated_recognition_percent DOUBLE PRECISION NOT NULL
    CHECK (estimated_recognition_percent BETWEEN 0 AND 100),
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  exclusion_flags TEXT[] NOT NULL DEFAULT '{}'
    CHECK (exclusion_flags <@ ARRAY['sensitive', 'university', 'company', 'place']::TEXT[]),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  difficulty TEXT GENERATED ALWAYS AS (
    CASE
      WHEN cardinality(exclusion_flags) > 0 OR estimated_recognition_percent >= 15 THEN 'rejected'
      WHEN estimated_recognition_percent <= 1 THEN 'extreme'
      ELSE 'standard'
    END
  ) STORED,
  policy_version TEXT NOT NULL DEFAULT 'tahoiya-recognition-v2'
    CHECK (char_length(policy_version) BETWEEN 1 AND 200),
  provider TEXT CHECK (provider IS NULL OR char_length(provider) <= 100),
  model TEXT CHECK (model IS NULL OR char_length(model) <= 200),
  prompt_version TEXT CHECK (prompt_version IS NULL OR char_length(prompt_version) <= 200),
  generation JSONB CHECK (
    generation IS NULL OR (
      jsonb_typeof(generation) = 'object'
      AND octet_length(generation::TEXT) <= 20000
    )
  ),
  screened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (difficulty IN ('standard', 'extreme', 'rejected'))
);

CREATE INDEX IF NOT EXISTS tahoiya_word_screenings_selection_idx
  ON tahoiya_word_screenings(difficulty, screened_at)
  WHERE difficulty IN ('standard', 'extreme');

REVOKE ALL ON tahoiya_word_screenings FROM PUBLIC;
GRANT SELECT ON tahoiya_word_screenings
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;

CREATE OR REPLACE FUNCTION record_tahoiya_screening_batch(
  screening_items JSONB,
  generation_meta JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  item_count INTEGER;
  affected_count INTEGER;
BEGIN
  IF jsonb_typeof(screening_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'screening_items must be an array';
  END IF;
  item_count := jsonb_array_length(screening_items);
  IF item_count < 1 OR item_count > 10 THEN
    RAISE EXCEPTION 'screening batch must contain 1 to 10 items';
  END IF;
  IF generation_meta IS NOT NULL AND (
    jsonb_typeof(generation_meta) IS DISTINCT FROM 'object'
    OR octet_length(generation_meta::TEXT) > 20000
  ) THEN
    RAISE EXCEPTION 'invalid screening generation metadata';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(screening_items) AS entry(item)
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR COALESCE(item->>'wordId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR CASE WHEN jsonb_typeof(item->'estimatedRecognitionPercent') = 'number'
        THEN (item->>'estimatedRecognitionPercent')::DOUBLE PRECISION NOT BETWEEN 0 AND 100
        ELSE TRUE END
      OR CASE WHEN jsonb_typeof(item->'confidence') = 'number'
        THEN (item->>'confidence')::INTEGER NOT BETWEEN 0 AND 100
        ELSE TRUE END
      OR jsonb_typeof(item->'exclusionFlags') IS DISTINCT FROM 'array'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(item->'exclusionFlags') AS flag(value)
        WHERE jsonb_typeof(value) IS DISTINCT FROM 'string'
          OR value #>> '{}' NOT IN ('sensitive', 'university', 'company', 'place')
      )
      OR char_length(BTRIM(COALESCE(item->>'reason', ''))) NOT BETWEEN 1 AND 1000
  ) THEN
    RAISE EXCEPTION 'invalid Tahoiya screening item';
  END IF;

  IF (
    SELECT COUNT(DISTINCT item->>'wordId')
    FROM jsonb_array_elements(screening_items) AS entry(item)
  ) <> item_count THEN
    RAISE EXCEPTION 'duplicate wordId in Tahoiya screening batch';
  END IF;

  INSERT INTO tahoiya_word_screenings (
    word_id, estimated_recognition_percent, confidence, exclusion_flags, reason,
    policy_version, provider, model, prompt_version, generation, screened_at, updated_at
  )
  SELECT
    (item->>'wordId')::UUID,
    (item->>'estimatedRecognitionPercent')::DOUBLE PRECISION,
    (item->>'confidence')::INTEGER,
    ARRAY(
      SELECT DISTINCT value
      FROM jsonb_array_elements_text(item->'exclusionFlags') AS flag(value)
      ORDER BY value
    ),
    BTRIM(item->>'reason'),
    'tahoiya-recognition-v2',
    NULLIF(generation_meta->>'provider', ''),
    NULLIF(generation_meta->>'model', ''),
    NULLIF(generation_meta->>'promptVersion', ''),
    generation_meta,
    NOW(),
    NOW()
  FROM jsonb_array_elements(screening_items) AS entry(item)
  ON CONFLICT (word_id) DO UPDATE SET
    estimated_recognition_percent = EXCLUDED.estimated_recognition_percent,
    confidence = EXCLUDED.confidence,
    exclusion_flags = EXCLUDED.exclusion_flags,
    reason = EXCLUDED.reason,
    policy_version = EXCLUDED.policy_version,
    provider = EXCLUDED.provider,
    model = EXCLUDED.model,
    prompt_version = EXCLUDED.prompt_version,
    generation = EXCLUDED.generation,
    screened_at = NOW(),
    updated_at = NOW();

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END $$;

CREATE OR REPLACE FUNCTION add_tahoiya_screening_exclusion(
  target_word_id UUID,
  exclusion_flag TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF exclusion_flag NOT IN ('sensitive', 'university', 'company', 'place') THEN
    RAISE EXCEPTION 'invalid Tahoiya exclusion flag';
  END IF;
  UPDATE tahoiya_word_screenings screening
  SET exclusion_flags = ARRAY(
      SELECT DISTINCT value
      FROM unnest(screening.exclusion_flags || exclusion_flag) AS item(value)
      ORDER BY value
    ),
    updated_at = NOW()
  WHERE screening.word_id = target_word_id;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION materialize_tahoiya_screened_topic(
  target_word_id UUID,
  target_reading TEXT,
  target_definition TEXT,
  target_note TEXT,
  target_source_detail TEXT,
  generation_meta JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  screened_difficulty TEXT;
  existing_topic_id UUID;
  generated_definition_id UUID;
  generated_topic_id UUID;
BEGIN
  IF char_length(BTRIM(COALESCE(target_reading, ''))) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid Tahoiya reading';
  END IF;
  IF char_length(BTRIM(COALESCE(target_definition, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'invalid Tahoiya definition';
  END IF;
  IF char_length(COALESCE(target_note, '')) > 1000
    OR char_length(COALESCE(target_source_detail, '')) > 2000 THEN
    RAISE EXCEPTION 'Tahoiya metadata is too long';
  END IF;
  IF generation_meta IS NOT NULL AND (
    jsonb_typeof(generation_meta) IS DISTINCT FROM 'object'
    OR octet_length(generation_meta::TEXT) > 20000
  ) THEN
    RAISE EXCEPTION 'invalid Tahoiya generation metadata';
  END IF;

  SELECT difficulty INTO screened_difficulty
  FROM tahoiya_word_screenings
  WHERE word_id = target_word_id;
  IF screened_difficulty NOT IN ('standard', 'extreme') THEN
    RAISE EXCEPTION 'word is not an eligible screened Tahoiya candidate';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(target_word_id::TEXT, 0));
  SELECT id INTO existing_topic_id
  FROM tahoiya_topics
  WHERE word_id = target_word_id AND status = 'active'
  ORDER BY updated_at DESC
  LIMIT 1;
  IF existing_topic_id IS NOT NULL THEN RETURN existing_topic_id; END IF;

  UPDATE words
  SET reading = COALESCE(NULLIF(reading, ''), BTRIM(target_reading)),
    updated_at = NOW()
  WHERE id = target_word_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'active Tahoiya word not found'; END IF;

  INSERT INTO word_definitions (
    word_id, short_definition, source_name, display_game_id, status,
    source_type, source_environment, source_reference,
    provider, model, prompt_version, reviewed_at, reviewed_by
  ) VALUES (
    target_word_id, BTRIM(target_definition), 'GAME FIELDS LLM screening', 'tahoiya', 'active',
    'ai', 'production', 'tahoiya-screening:' || target_word_id::TEXT,
    NULLIF(generation_meta->>'provider', ''), NULLIF(generation_meta->>'model', ''),
    NULLIF(generation_meta->>'promptVersion', ''), NOW(), 'tahoiya-screening-v2'
  ) RETURNING id INTO generated_definition_id;

  INSERT INTO word_game_eligibility (
    subject_type, subject_id, game_id, enabled, difficulty, reason
  ) VALUES (
    'word', target_word_id, 'tahoiya', TRUE, screened_difficulty, 'tahoiya-llm-screening-v2'
  ) ON CONFLICT (subject_type, subject_id, game_id) DO UPDATE SET
    enabled = CASE WHEN word_game_eligibility.manually_suspended THEN FALSE ELSE TRUE END,
    difficulty = EXCLUDED.difficulty,
    reason = EXCLUDED.reason,
    updated_at = NOW();

  INSERT INTO tahoiya_topics (
    word_id, definition_id, difficulty, note, source_detail, source_kind,
    difficulty_reason, difficulty_judged_by, difficulty_rubric_version,
    generation, status, source_type, source_environment, source_reference,
    reviewed_at, reviewed_by
  ) VALUES (
    target_word_id, generated_definition_id, screened_difficulty,
    COALESCE(target_note, ''), COALESCE(target_source_detail, ''), 'llm',
    'LLM estimated recognition threshold', 'shared-game-llm', 'tahoiya-recognition-v2',
    generation_meta, 'active', 'ai', 'production',
    'tahoiya-screening:' || target_word_id::TEXT, NOW(), 'tahoiya-screening-v2'
  ) ON CONFLICT (word_id) DO UPDATE SET
    definition_id = EXCLUDED.definition_id,
    difficulty = EXCLUDED.difficulty,
    note = EXCLUDED.note,
    source_detail = EXCLUDED.source_detail,
    source_kind = EXCLUDED.source_kind,
    difficulty_reason = EXCLUDED.difficulty_reason,
    difficulty_judged_by = EXCLUDED.difficulty_judged_by,
    difficulty_rubric_version = EXCLUDED.difficulty_rubric_version,
    generation = EXCLUDED.generation,
    status = 'active',
    source_type = EXCLUDED.source_type,
    source_environment = EXCLUDED.source_environment,
    source_reference = EXCLUDED.source_reference,
    reviewed_at = EXCLUDED.reviewed_at,
    reviewed_by = EXCLUDED.reviewed_by,
    updated_at = NOW()
  RETURNING id INTO generated_topic_id;

  RETURN generated_topic_id;
END $$;

REVOKE ALL ON FUNCTION record_tahoiya_screening_batch(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_tahoiya_screening_exclusion(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION materialize_tahoiya_screened_topic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION record_tahoiya_screening_batch(JSONB, JSONB)
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;
GRANT EXECUTE ON FUNCTION add_tahoiya_screening_exclusion(UUID, TEXT)
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;
GRANT EXECUTE ON FUNCTION materialize_tahoiya_screened_topic(UUID, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;
