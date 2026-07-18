CREATE TABLE IF NOT EXISTS word_game_evaluation_reviews (
  evaluation_id UUID PRIMARY KEY REFERENCES word_game_evaluations(id),
  decision TEXT NOT NULL CHECK (decision IN ('adopted', 'rejected')),
  reviewed_by TEXT NOT NULL CHECK (char_length(reviewed_by) BETWEEN 1 AND 320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS word_game_evaluation_reviews_created_idx
  ON word_game_evaluation_reviews(created_at DESC);

REVOKE ALL ON word_game_evaluation_reviews FROM PUBLIC;
GRANT SELECT, INSERT ON word_game_evaluation_reviews TO vocabulary_admin;

CREATE OR REPLACE FUNCTION enforce_word_game_evaluation_review_policy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'word game evaluation final reviews are immutable';
END $$;

DROP TRIGGER IF EXISTS word_game_evaluation_review_policy ON word_game_evaluation_reviews;
CREATE TRIGGER word_game_evaluation_review_policy
  BEFORE UPDATE OR DELETE ON word_game_evaluation_reviews
  FOR EACH ROW EXECUTE FUNCTION enforce_word_game_evaluation_review_policy();

-- Preserve the old workflow: evaluations whose linked pair draft was already
-- reviewed must not reappear when the queue starts using evaluation-level reviews.
INSERT INTO word_game_evaluation_reviews (evaluation_id, decision, reviewed_by, created_at)
SELECT evaluation.id,
  CASE linked_draft.status::text WHEN 'active' THEN 'adopted' ELSE 'rejected' END,
  LEFT(COALESCE(NULLIF(linked_draft.reviewed_by, ''), 'migration:linked-draft'), 320),
  COALESCE(linked_draft.reviewed_at, linked_draft.created_at, NOW())
FROM word_game_evaluations evaluation
JOIN LATERAL (
  SELECT draft.status, draft.reviewed_by, draft.reviewed_at, draft.created_at
  FROM vocabulary_draft_submissions draft
  WHERE draft.kind = 'pair'
    AND draft.status IN ('active', 'rejected')
    AND draft.payload->>'gameId' = 'wordwolf'
    AND draft.payload->>'anchorWordId' = evaluation.word_id::text
    AND draft.payload->>'pairDistance' = evaluation.requested_pair_distance
    AND (
      draft.payload->>'villageWord' = evaluation.partner_text
      OR draft.payload->>'wolfWord' = evaluation.partner_text
    )
  ORDER BY draft.reviewed_at DESC NULLS LAST, draft.created_at DESC, draft.id DESC
  LIMIT 1
) linked_draft ON TRUE
WHERE evaluation.game_id = 'wordwolf'
ON CONFLICT (evaluation_id) DO NOTHING;
