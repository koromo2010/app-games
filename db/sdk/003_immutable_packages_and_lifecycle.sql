ALTER TABLE sdk_creators
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS package_root_sha256 CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS development_root_sha256 CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS stable_root_sha256 CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sdk_game_package_revisions (
  game_id UUID NOT NULL REFERENCES sdk_games(id) ON DELETE CASCADE,
  revision CHAR(40) NOT NULL,
  package_root_sha256 CHAR(64) NOT NULL,
  server_bundle_sha256 CHAR(64) NOT NULL,
  app_set_source_sha256 CHAR(64) NOT NULL,
  manifest JSONB NOT NULL,
  sdk_package_version VARCHAR(32) NOT NULL,
  sdk_contract_version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (game_id, revision),
  UNIQUE (game_id, package_root_sha256)
);

CREATE TABLE IF NOT EXISTS sdk_game_channel_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES sdk_games(id) ON DELETE CASCADE,
  channel VARCHAR(24) NOT NULL CHECK (channel IN ('development', 'stable')),
  revision CHAR(40) NOT NULL,
  package_root_sha256 CHAR(64) NOT NULL,
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, channel, revision)
);

CREATE INDEX IF NOT EXISTS sdk_game_channel_history_lookup_idx
  ON sdk_game_channel_history (game_id, channel, revision);
