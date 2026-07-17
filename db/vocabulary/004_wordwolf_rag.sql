ALTER TABLE word_pairs ADD COLUMN IF NOT EXISTS pair_distance TEXT;
ALTER TABLE word_pairs ADD COLUMN IF NOT EXISTS requested_pair_distance TEXT;

UPDATE word_pairs pair
SET pair_distance = CASE
  WHEN pair.difficulty IN ('near', 'balanced', 'wide') THEN pair.difficulty
  ELSE 'balanced'
END
FROM word_game_eligibility eligibility
WHERE eligibility.subject_type = 'pair'
  AND eligibility.subject_id = pair.id
  AND eligibility.game_id = 'wordwolf'
  AND pair.pair_distance IS NULL;

UPDATE word_pairs pair
SET requested_pair_distance = pair.pair_distance
FROM word_game_eligibility eligibility
WHERE eligibility.subject_type = 'pair'
  AND eligibility.subject_id = pair.id
  AND eligibility.game_id = 'wordwolf'
  AND pair.requested_pair_distance IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'word_pairs_pair_distance_check' AND conrelid = 'word_pairs'::regclass
  ) THEN
    ALTER TABLE word_pairs ADD CONSTRAINT word_pairs_pair_distance_check
      CHECK (pair_distance IS NULL OR pair_distance IN ('near', 'balanced', 'wide'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'word_pairs_requested_pair_distance_check' AND conrelid = 'word_pairs'::regclass
  ) THEN
    ALTER TABLE word_pairs ADD CONSTRAINT word_pairs_requested_pair_distance_check
      CHECK (requested_pair_distance IS NULL OR requested_pair_distance IN ('near', 'balanced', 'wide'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS word_pairs_active_distance_idx
  ON word_pairs(pair_distance)
  WHERE status = 'active';

CREATE OR REPLACE VIEW active_word_pairs AS
  SELECT * FROM word_pairs WHERE status = 'active';

CREATE TABLE IF NOT EXISTS word_pair_distance_stats (
  pair_id UUID PRIMARY KEY REFERENCES word_pairs(id),
  too_close_count BIGINT NOT NULL DEFAULT 0 CHECK (too_close_count >= 0),
  good_count BIGINT NOT NULL DEFAULT 0 CHECK (good_count >= 0),
  too_far_count BIGINT NOT NULL DEFAULT 0 CHECK (too_far_count >= 0),
  last_aggregated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION refresh_word_pair_distance(target_pair_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  current_distance TEXT;
  next_distance TEXT;
  close_count BIGINT;
  far_count BIGINT;
  total_count BIGINT;
BEGIN
  SELECT pair_distance INTO current_distance FROM word_pairs WHERE id = target_pair_id FOR UPDATE;
  IF current_distance IS NULL THEN RAISE EXCEPTION 'pair not found or distance is unset'; END IF;

  SELECT too_close_count, too_far_count, too_close_count + good_count + too_far_count
    INTO close_count, far_count, total_count
  FROM word_pair_distance_stats WHERE pair_id = target_pair_id;
  IF total_count IS NULL OR total_count < 5 THEN RETURN current_distance; END IF;

  next_distance := current_distance;
  IF close_count::double precision / total_count >= 0.6 THEN
    next_distance := CASE current_distance WHEN 'near' THEN 'balanced' ELSE 'wide' END;
  ELSIF far_count::double precision / total_count >= 0.6 THEN
    next_distance := CASE current_distance WHEN 'wide' THEN 'balanced' ELSE 'near' END;
  END IF;

  UPDATE word_pairs SET pair_distance = next_distance, updated_at = NOW() WHERE id = target_pair_id;
  RETURN next_distance;
END $$;

REVOKE ALL ON FUNCTION refresh_word_pair_distance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_word_pair_distance(UUID) TO vocabulary_batch, vocabulary_admin;

CREATE TABLE IF NOT EXISTS word_game_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  word_id UUID NOT NULL REFERENCES words(id),
  game_id TEXT NOT NULL,
  requested_pair_distance TEXT CHECK (requested_pair_distance IS NULL OR requested_pair_distance IN ('near', 'balanced', 'wide')),
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'reject')),
  usage_penalty DOUBLE PRECISION NOT NULL CHECK (usage_penalty IN (0, 0.5, 1, 1.5)),
  game_penalty DOUBLE PRECISION NOT NULL CHECK (game_penalty IN (0, 0.5, 1, 1.5)),
  feedback_adjustment DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (feedback_adjustment BETWEEN -0.5 AND 0.5),
  safety_flags TEXT[] NOT NULL DEFAULT '{}',
  reason_code TEXT NOT NULL,
  pair_reason TEXT NOT NULL,
  partner_text TEXT,
  partner_word_id UUID REFERENCES words(id),
  source_environment vocabulary_source_environment NOT NULL,
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  generation_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE word_game_evaluations ADD COLUMN IF NOT EXISTS requested_pair_distance TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'word_game_evaluations_requested_pair_distance_check'
      AND conrelid = 'word_game_evaluations'::regclass
  ) THEN
    ALTER TABLE word_game_evaluations ADD CONSTRAINT word_game_evaluations_requested_pair_distance_check
      CHECK (requested_pair_distance IS NULL OR requested_pair_distance IN ('near', 'balanced', 'wide'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS word_game_evaluations_word_game_distance_created_idx
  ON word_game_evaluations(word_id, game_id, requested_pair_distance, created_at DESC);

CREATE INDEX IF NOT EXISTS words_active_general_zipf_idx
  ON words(zipf)
  WHERE status = 'active' AND NOT proper_noun AND zipf IS NOT NULL;

DROP VIEW IF EXISTS latest_word_game_evaluations;
CREATE VIEW latest_word_game_evaluations AS
  SELECT DISTINCT ON (word_id, game_id, requested_pair_distance)
    id, word_id, game_id, requested_pair_distance, decision, usage_penalty, game_penalty,
    feedback_adjustment, safety_flags, reason_code, pair_reason,
    partner_text, partner_word_id, source_environment, provider, model,
    prompt_version, generation_batch_id, created_at
  FROM word_game_evaluations
  ORDER BY word_id, game_id, requested_pair_distance, created_at DESC, id DESC;

GRANT SELECT ON word_game_evaluations, latest_word_game_evaluations, word_pair_distance_stats
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;
GRANT INSERT ON word_game_evaluations TO vocabulary_development, vocabulary_batch, vocabulary_admin;
GRANT INSERT, UPDATE ON word_pair_distance_stats TO vocabulary_batch, vocabulary_admin;

CREATE OR REPLACE FUNCTION enforce_word_game_evaluation_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'word game evaluations are append-only';
  END IF;
  IF current_user = 'vocabulary_development' AND NEW.source_environment <> 'development' THEN
    RAISE EXCEPTION 'development writer must use source_environment=development';
  END IF;
  IF current_user = 'vocabulary_batch' AND NEW.source_environment <> 'batch' THEN
    RAISE EXCEPTION 'batch writer must use source_environment=batch';
  END IF;
  IF NEW.game_id = 'wordwolf' AND NEW.requested_pair_distance IS NULL THEN
    RAISE EXCEPTION 'wordwolf evaluation requires requested_pair_distance';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS word_game_evaluation_policy ON word_game_evaluations;
CREATE TRIGGER word_game_evaluation_policy
  BEFORE INSERT OR UPDATE OR DELETE ON word_game_evaluations
  FOR EACH ROW EXECUTE FUNCTION enforce_word_game_evaluation_policy();
