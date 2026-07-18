ALTER TABLE words
  ADD COLUMN IF NOT EXISTS selection_zipf_override DOUBLE PRECISION;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'words_selection_zipf_override_check'
      AND conrelid = 'words'::regclass
  ) THEN
    ALTER TABLE words ADD CONSTRAINT words_selection_zipf_override_check
      CHECK (selection_zipf_override IS NULL OR selection_zipf_override BETWEEN 0 AND 10);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS words_active_effective_zipf_idx
  ON words ((COALESCE(selection_zipf_override, zipf)))
  WHERE status = 'active' AND NOT proper_noun
    AND COALESCE(selection_zipf_override, zipf) IS NOT NULL;

CREATE OR REPLACE VIEW active_words AS
  SELECT word.*,
    COALESCE(word.selection_zipf_override, word.zipf) AS effective_zipf
  FROM words word
  WHERE word.status = 'active';

GRANT SELECT ON active_words
  TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;

