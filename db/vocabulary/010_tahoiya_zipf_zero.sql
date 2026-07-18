-- Tahoiya topics are isolated from ordinary-game selection by the shared,
-- global effective Zipf value. Every Tahoiya-eligible word is exactly 0.

UPDATE words word
SET selection_zipf_override = 0,
    updated_at = NOW()
FROM word_game_eligibility eligibility
WHERE eligibility.subject_type = 'word'
  AND eligibility.subject_id = word.id
  AND eligibility.game_id = 'tahoiya'
  AND eligibility.enabled
  AND NOT eligibility.manually_suspended
  AND COALESCE(word.selection_zipf_override, word.zipf) IS DISTINCT FROM 0;

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
  AND COALESCE(word.selection_zipf_override, word.zipf) = 0
  AND (eligibility.valid_from IS NULL OR eligibility.valid_from <= NOW())
  AND (eligibility.valid_until IS NULL OR eligibility.valid_until > NOW());

GRANT SELECT ON active_tahoiya_topics
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;
