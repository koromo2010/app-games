-- Create these LOGIN roles in the Neon Console before running this file:
-- vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin.
-- Passwords belong in Neon/Vercel only and must never be committed here.

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO vocabulary_production, vocabulary_development, vocabulary_batch, vocabulary_admin;

GRANT SELECT ON active_words, active_word_definitions, active_word_pairs, active_word_groups,
  active_word_group_members, active_word_game_eligibility, vocabulary_quality_stats TO vocabulary_production;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO vocabulary_development, vocabulary_batch, vocabulary_admin;
GRANT INSERT ON vocabulary_draft_submissions TO vocabulary_development, vocabulary_batch;
GRANT INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO vocabulary_admin;

CREATE OR REPLACE FUNCTION enforce_game_writer_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('vocabulary_development', 'vocabulary_batch') THEN
    IF TG_OP <> 'INSERT' OR NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'game writers may only insert draft records';
    END IF;
    IF current_user = 'vocabulary_development' AND NEW.source_environment <> 'development' THEN
      RAISE EXCEPTION 'development writer must use source_environment=development';
    END IF;
    IF current_user = 'vocabulary_batch' AND NEW.source_environment <> 'batch' THEN
      RAISE EXCEPTION 'batch writer must use source_environment=batch';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER words_writer_policy BEFORE INSERT OR UPDATE OR DELETE ON words FOR EACH ROW EXECUTE FUNCTION enforce_game_writer_policy();
CREATE TRIGGER definitions_writer_policy BEFORE INSERT OR UPDATE OR DELETE ON word_definitions FOR EACH ROW EXECUTE FUNCTION enforce_game_writer_policy();
CREATE TRIGGER pairs_writer_policy BEFORE INSERT OR UPDATE OR DELETE ON word_pairs FOR EACH ROW EXECUTE FUNCTION enforce_game_writer_policy();
CREATE TRIGGER groups_writer_policy BEFORE INSERT OR UPDATE OR DELETE ON word_groups FOR EACH ROW EXECUTE FUNCTION enforce_game_writer_policy();

CREATE OR REPLACE FUNCTION enforce_group_member_writer_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status vocabulary_status;
BEGIN
  IF current_user IN ('vocabulary_development', 'vocabulary_batch') THEN
    IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'game writers may only insert group members'; END IF;
    SELECT status INTO parent_status FROM word_groups WHERE id = NEW.group_id;
    IF parent_status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'game writers may only add members to draft groups';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER group_members_writer_policy BEFORE INSERT OR UPDATE OR DELETE ON word_group_members
  FOR EACH ROW EXECUTE FUNCTION enforce_group_member_writer_policy();

CREATE OR REPLACE FUNCTION enforce_draft_submission_policy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'draft submissions are append-only'; END IF;
  IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'draft submission status must be draft'; END IF;
  IF current_user = 'vocabulary_development' AND NEW.source_environment <> 'development' THEN
    RAISE EXCEPTION 'development writer must use source_environment=development';
  END IF;
  IF current_user = 'vocabulary_batch' AND NEW.source_environment <> 'batch' THEN
    RAISE EXCEPTION 'batch writer must use source_environment=batch';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER draft_submission_policy BEFORE INSERT OR UPDATE OR DELETE ON vocabulary_draft_submissions
  FOR EACH ROW EXECUTE FUNCTION enforce_draft_submission_policy();
