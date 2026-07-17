CREATE TABLE IF NOT EXISTS word_game_human_votes (
  evaluation_id UUID NOT NULL REFERENCES word_game_evaluations(id),
  voter TEXT NOT NULL CHECK (char_length(voter) BETWEEN 1 AND 320),
  decision TEXT NOT NULL CHECK (decision IN ('accept', 'reject')),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (evaluation_id, voter)
);

ALTER TABLE word_game_human_votes ADD COLUMN IF NOT EXISTS comment TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'word_game_human_votes_comment_check'
      AND conrelid = 'word_game_human_votes'::regclass
  ) THEN
    ALTER TABLE word_game_human_votes ADD CONSTRAINT word_game_human_votes_comment_check
      CHECK (comment IS NULL OR char_length(comment) <= 500);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS word_game_human_votes_updated_idx
  ON word_game_human_votes(updated_at DESC);

REVOKE ALL ON word_game_human_votes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON word_game_human_votes TO vocabulary_admin;

CREATE OR REPLACE FUNCTION enforce_word_game_human_vote_policy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'word game human votes may not be physically deleted';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.evaluation_id <> OLD.evaluation_id OR NEW.voter <> OLD.voter THEN
      RAISE EXCEPTION 'word game human vote identity is immutable';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS word_game_human_vote_policy ON word_game_human_votes;
CREATE TRIGGER word_game_human_vote_policy
  BEFORE UPDATE OR DELETE ON word_game_human_votes
  FOR EACH ROW EXECUTE FUNCTION enforce_word_game_human_vote_policy();

CREATE OR REPLACE VIEW word_game_human_vote_summary AS
  SELECT evaluation_id,
    COUNT(*) FILTER (WHERE decision = 'accept')::bigint AS accept_count,
    COUNT(*) FILTER (WHERE decision = 'reject')::bigint AS reject_count,
    MAX(updated_at) AS updated_at
  FROM word_game_human_votes
  GROUP BY evaluation_id;

REVOKE ALL ON word_game_human_vote_summary FROM PUBLIC;
GRANT SELECT ON word_game_human_vote_summary
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;

-- Human review remains its own record, while also contributing one topic-quality
-- feedback signal. Future player feedback can be UNIONed into this view without
-- mixing topic quality with the separate pair-distance axis.
CREATE OR REPLACE VIEW word_game_feedback_signals AS
  SELECT vote.evaluation_id,
    evaluation.word_id,
    evaluation.game_id,
    evaluation.requested_pair_distance,
    'admin'::text AS source_type,
    'topic_quality'::text AS feedback_axis,
    CASE vote.decision WHEN 'accept' THEN 'good' ELSE 'bad' END AS rating,
    vote.updated_at
  FROM word_game_human_votes vote
  JOIN word_game_evaluations evaluation ON evaluation.id = vote.evaluation_id;

CREATE OR REPLACE VIEW word_game_feedback_signal_summary AS
  SELECT evaluation_id, feedback_axis,
    COUNT(*) FILTER (WHERE rating = 'good')::bigint AS good_count,
    COUNT(*) FILTER (WHERE rating = 'bad')::bigint AS bad_count,
    COUNT(*) FILTER (WHERE rating = 'too_close')::bigint AS too_close_count,
    COUNT(*) FILTER (WHERE rating = 'too_far')::bigint AS too_far_count,
    MAX(updated_at) AS updated_at
  FROM word_game_feedback_signals
  GROUP BY evaluation_id, feedback_axis;

REVOKE ALL ON word_game_feedback_signals, word_game_feedback_signal_summary FROM PUBLIC;
GRANT SELECT ON word_game_feedback_signals, word_game_feedback_signal_summary
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;

-- Sanitized, comment-bearing examples are batch/admin only. They are not read by
-- the live game prompt; a future offline job can classify, summarize, or embed
-- them before feeding derived signals back into RAG.
CREATE OR REPLACE VIEW word_game_feedback_training_examples AS
  SELECT evaluation.id AS evaluation_id,
    evaluation.word_id,
    evaluation.game_id,
    evaluation.requested_pair_distance,
    evaluation.decision AS llm_decision,
    evaluation.usage_penalty,
    evaluation.game_penalty,
    evaluation.reason_code,
    evaluation.pair_reason,
    evaluation.partner_text,
    evaluation.provider,
    evaluation.model,
    'admin'::text AS source_type,
    'topic_quality'::text AS feedback_axis,
    CASE vote.decision WHEN 'accept' THEN 'good' ELSE 'bad' END AS rating,
    vote.comment,
    vote.updated_at
  FROM word_game_human_votes vote
  JOIN word_game_evaluations evaluation ON evaluation.id = vote.evaluation_id
  WHERE vote.comment IS NOT NULL AND vote.comment <> '';

REVOKE ALL ON word_game_feedback_training_examples FROM PUBLIC;
GRANT SELECT ON word_game_feedback_training_examples TO vocabulary_batch, vocabulary_admin;

CREATE OR REPLACE VIEW latest_word_game_evaluations AS
  WITH latest AS (
    SELECT DISTINCT ON (evaluation.word_id, evaluation.game_id, evaluation.requested_pair_distance)
      evaluation.id, evaluation.word_id, evaluation.game_id, evaluation.requested_pair_distance,
      evaluation.decision, evaluation.usage_penalty, evaluation.game_penalty,
      evaluation.feedback_adjustment, evaluation.safety_flags, evaluation.reason_code,
      evaluation.pair_reason, evaluation.partner_text, evaluation.partner_word_id,
      evaluation.source_environment, evaluation.provider, evaluation.model,
      evaluation.prompt_version, evaluation.generation_batch_id, evaluation.created_at
    FROM word_game_evaluations evaluation
    ORDER BY evaluation.word_id, evaluation.game_id, evaluation.requested_pair_distance,
      evaluation.created_at DESC, evaluation.id DESC
  )
  SELECT latest.id, latest.word_id, latest.game_id, latest.requested_pair_distance,
    CASE
      WHEN COALESCE(feedback.good_count, 0) > COALESCE(feedback.bad_count, 0) THEN 'accept'
      WHEN COALESCE(feedback.bad_count, 0) > COALESCE(feedback.good_count, 0) THEN 'reject'
      ELSE latest.decision
    END AS decision,
    latest.usage_penalty, latest.game_penalty, latest.feedback_adjustment,
    latest.safety_flags, latest.reason_code, latest.pair_reason, latest.partner_text,
    latest.partner_word_id, latest.source_environment, latest.provider, latest.model,
    latest.prompt_version, latest.generation_batch_id, latest.created_at
  FROM latest
  LEFT JOIN word_game_feedback_signal_summary feedback
    ON feedback.evaluation_id = latest.id
    AND feedback.feedback_axis = 'topic_quality';

GRANT SELECT ON latest_word_game_evaluations
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;
