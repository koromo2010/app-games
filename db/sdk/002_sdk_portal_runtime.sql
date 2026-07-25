ALTER TABLE sdk_creators
  ADD COLUMN IF NOT EXISTS owner_player_id VARCHAR(120);

ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS module_policy JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS mock_revision CHAR(40);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS package_revision CHAR(40);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS package_bundle_sha256 CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS package_app_set_sha256 CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS development_revision CHAR(40);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS development_bundle_sha256 CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS development_app_set_sha256 CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS development_manifest JSONB;
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS stable_revision CHAR(40);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS stable_bundle_sha256 CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS stable_app_set_sha256 CHAR(64);
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS stable_manifest JSONB;
ALTER TABLE sdk_games
  ADD COLUMN IF NOT EXISTS public_game_id VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS sdk_creators_owner_slug_idx
  ON sdk_creators (owner_player_id, slug)
  WHERE owner_player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sdk_games_creator_updated_idx
  ON sdk_games (creator_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sdk_games_public_game_id_idx
  ON sdk_games (public_game_id)
  WHERE public_game_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sdk_oauth_clients (
  client_id VARCHAR(96) PRIMARY KEY,
  client_name VARCHAR(120) NOT NULL,
  redirect_uris JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sdk_oauth_codes (
  code_hash CHAR(64) PRIMARY KEY,
  client_id VARCHAR(96) NOT NULL REFERENCES sdk_oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  player_id VARCHAR(120) NOT NULL,
  scope TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  code_challenge VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sdk_oauth_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token_hash CHAR(64) NOT NULL UNIQUE,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  client_id VARCHAR(96) NOT NULL REFERENCES sdk_oauth_clients(client_id) ON DELETE CASCADE,
  player_id VARCHAR(120) NOT NULL,
  scope TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  access_expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sdk_oauth_codes
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT '';
ALTER TABLE sdk_oauth_grants
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS sdk_oauth_grants_access_idx
  ON sdk_oauth_grants (access_token_hash)
  WHERE revoked_at IS NULL;
