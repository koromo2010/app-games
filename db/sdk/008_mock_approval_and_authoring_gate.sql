ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS mock_approved_revision CHAR(40);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS mock_approved_at TIMESTAMPTZ;
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS mock_approved_by_player_id TEXT;
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS module_profile_revision UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS module_contract_digest CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS module_profile_confirmed_at TIMESTAMPTZ;
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS module_profile_confirmed_by_player_id TEXT;
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS prototype_module_profile_revision UUID;
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS prototype_module_contract_digest CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS prototype_sdk_package_version VARCHAR(32);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS prototype_source_sha256 CHAR(64);

CREATE INDEX IF NOT EXISTS sdk_games_mock_approval_idx
  ON sdk_games (creator_id, game_id, mock_revision, mock_approved_revision);
CREATE INDEX IF NOT EXISTS sdk_games_module_contract_idx
  ON sdk_games (creator_id, game_id, module_profile_revision, module_contract_digest);

ALTER TABLE sdk_game_package_revisions
  ADD COLUMN IF NOT EXISTS module_profile_revision UUID;
ALTER TABLE sdk_game_package_revisions
  ADD COLUMN IF NOT EXISTS module_contract_digest CHAR(64);
ALTER TABLE sdk_game_package_revisions
  ADD COLUMN IF NOT EXISTS prototype_revision CHAR(40);
ALTER TABLE sdk_game_package_revisions
  ADD COLUMN IF NOT EXISTS shared_source_sha256 CHAR(64);
