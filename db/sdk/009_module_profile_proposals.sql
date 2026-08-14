CREATE TABLE IF NOT EXISTS sdk_game_module_profile_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES sdk_creators(id) ON DELETE CASCADE,
  game_row_id UUID NOT NULL REFERENCES sdk_games(id) ON DELETE CASCADE,
  game_id VARCHAR(64) NOT NULL,
  proposer_client VARCHAR(32) NOT NULL,
  environment VARCHAR(16) NOT NULL CHECK (environment IN ('development', 'production')),
  request_id UUID NOT NULL,
  base_module_profile_revision UUID NOT NULL,
  base_module_contract_digest CHAR(64) NOT NULL,
  catalog_digest CHAR(64) NOT NULL,
  specification JSONB NOT NULL,
  proposed_profile JSONB NOT NULL,
  diff JSONB NOT NULL,
  dependencies JSONB NOT NULL,
  impact JSONB NOT NULL,
  warnings JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'replaced', 'expired')),
  approved_by_player_id TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (creator_id, game_row_id, request_id)
);

CREATE INDEX IF NOT EXISTS sdk_game_module_profile_proposals_lookup_idx
  ON sdk_game_module_profile_proposals (creator_id, game_row_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS sdk_game_module_profile_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES sdk_game_module_profile_proposals(id) ON DELETE SET NULL,
  creator_id UUID NOT NULL REFERENCES sdk_creators(id) ON DELETE CASCADE,
  game_row_id UUID NOT NULL REFERENCES sdk_games(id) ON DELETE CASCADE,
  action VARCHAR(24) NOT NULL CHECK (action IN ('prepared', 'edited', 'approved', 'rejected', 'stale')),
  actor_kind VARCHAR(16) NOT NULL CHECK (actor_kind IN ('ai', 'owner', 'system')),
  actor_player_id TEXT,
  actor_client VARCHAR(32),
  base_module_profile_revision UUID,
  base_module_contract_digest CHAR(64),
  new_module_profile_revision UUID,
  new_module_contract_digest CHAR(64),
  diff JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sdk_game_module_profile_audit_lookup_idx
  ON sdk_game_module_profile_audit (creator_id, game_row_id, created_at DESC);
