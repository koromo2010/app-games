-- Restore the two Tahoiya difficulty bands after 010 temporarily collapsed
-- every Tahoiya-eligible word to effective Zipf 0.

UPDATE words word
SET selection_zipf_override = CASE
      WHEN topic.difficulty = 'extreme' THEN 0
      WHEN word.zipf > 0 AND word.zipf < 3 THEN NULL
      ELSE 2.9
    END,
    updated_at = NOW()
FROM tahoiya_topics topic
WHERE topic.word_id = word.id
  AND word.selection_zipf_override IS DISTINCT FROM CASE
    WHEN topic.difficulty = 'extreme' THEN 0
    WHEN word.zipf > 0 AND word.zipf < 3 THEN NULL
    ELSE 2.9
  END;

UPDATE words word
SET selection_zipf_override = CASE
      WHEN word.zipf > 0 AND word.zipf < 3 THEN NULL
      ELSE 2.9
    END,
    updated_at = NOW()
FROM word_game_eligibility eligibility
WHERE eligibility.subject_type = 'word'
  AND eligibility.subject_id = word.id
  AND eligibility.game_id = 'tahoiya'
  AND eligibility.enabled
  AND NOT eligibility.manually_suspended
  AND word.selection_zipf_override = 0
  AND word.zipf IS DISTINCT FROM 0
  AND NOT EXISTS (
    SELECT 1 FROM tahoiya_topics topic WHERE topic.word_id = word.id
  );

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
  AND COALESCE(word.selection_zipf_override, word.zipf) >= 0
  AND COALESCE(word.selection_zipf_override, word.zipf) < 3
  AND (eligibility.valid_from IS NULL OR eligibility.valid_from <= NOW())
  AND (eligibility.valid_until IS NULL OR eligibility.valid_until > NOW());

GRANT SELECT ON active_tahoiya_topics
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;
