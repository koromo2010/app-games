-- A word promoted from the Wordwolf review queue to Tahoiya is, by definition,
-- not selected as a normal Wordwolf pair candidate. Backfill that final review
-- decision for promotions made before the application started doing both in one action.
WITH tahoiya_promotions AS (
  SELECT evaluation.id AS evaluation_id, evaluation.word_id,
    evaluation.requested_pair_distance, evaluation.partner_text
  FROM word_game_evaluations evaluation
  JOIN word_game_eligibility eligibility
    ON eligibility.subject_type = 'word'
    AND eligibility.subject_id = evaluation.word_id
    AND eligibility.game_id = 'tahoiya'
    AND eligibility.enabled
    AND NOT eligibility.manually_suspended
    AND eligibility.reason = 'admin-selected-from-wordwolf-review'
  LEFT JOIN word_game_evaluation_reviews final_review
    ON final_review.evaluation_id = evaluation.id
  WHERE evaluation.game_id = 'wordwolf'
    AND final_review.evaluation_id IS NULL
), rejected_drafts AS (
  UPDATE vocabulary_draft_submissions draft
  SET status = 'rejected',
    reviewed_at = NOW(),
    reviewed_by = 'migration:tahoiya-wordwolf-rejection'
  FROM tahoiya_promotions promotion
  WHERE draft.kind = 'pair'
    AND draft.status = 'draft'
    AND draft.payload->>'gameId' = 'wordwolf'
    AND draft.payload->>'anchorWordId' = promotion.word_id::text
    AND draft.payload->>'pairDistance' = promotion.requested_pair_distance
    AND (
      draft.payload->>'villageWord' = promotion.partner_text
      OR draft.payload->>'wolfWord' = promotion.partner_text
    )
  RETURNING draft.id
)
INSERT INTO word_game_evaluation_reviews (evaluation_id, decision, reviewed_by)
SELECT promotion.evaluation_id, 'rejected', 'migration:tahoiya-wordwolf-rejection'
FROM tahoiya_promotions promotion
ON CONFLICT (evaluation_id) DO NOTHING;
