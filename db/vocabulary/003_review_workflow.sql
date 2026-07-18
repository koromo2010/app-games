ALTER TABLE vocabulary_draft_submissions
  DROP CONSTRAINT IF EXISTS vocabulary_draft_submissions_status_check;

ALTER TABLE vocabulary_draft_submissions
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by TEXT,
  ADD COLUMN IF NOT EXISTS materialized_subject_type TEXT,
  ADD COLUMN IF NOT EXISTS materialized_subject_id UUID;

CREATE INDEX IF NOT EXISTS vocabulary_drafts_status_created_idx
  ON vocabulary_draft_submissions(status, created_at DESC);

GRANT SELECT, UPDATE ON vocabulary_draft_submissions TO vocabulary_admin;

DROP TRIGGER IF EXISTS draft_submission_policy ON vocabulary_draft_submissions;
CREATE OR REPLACE FUNCTION enforce_draft_submission_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('vocabulary_development', 'vocabulary_batch') THEN
    IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'draft writers are append-only'; END IF;
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'draft submission status must be draft'; END IF;
    IF current_user = 'vocabulary_development' AND NEW.source_environment <> 'development' THEN
      RAISE EXCEPTION 'development writer must use source_environment=development';
    END IF;
    IF current_user = 'vocabulary_batch' AND NEW.source_environment <> 'batch' THEN
      RAISE EXCEPTION 'batch writer must use source_environment=batch';
    END IF;
  ELSIF current_user = 'vocabulary_admin' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'draft submissions may not be physically deleted'; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'reviewed submissions are immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER draft_submission_policy BEFORE INSERT OR UPDATE OR DELETE ON vocabulary_draft_submissions
  FOR EACH ROW EXECUTE FUNCTION enforce_draft_submission_policy();
