CREATE TABLE IF NOT EXISTS sdk_creator_recovery_operations (
  operation_id UUID PRIMARY KEY,
  operation_nonce UUID NOT NULL UNIQUE,
  creator_id UUID NOT NULL REFERENCES sdk_creators(id) ON DELETE RESTRICT,
  target_key VARCHAR(64) NOT NULL
    CHECK (
      target_key ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'
    ),
  intent VARCHAR(64) NOT NULL
    CHECK (intent = 'bounded-quarantine-reconstruction-v1'),
  plan_receipt CHAR(64) NOT NULL,
  terminal_receipt CHAR(64),
  state VARCHAR(16) NOT NULL
    CHECK (state IN ('pending', 'completed')),
  phase VARCHAR(24) NOT NULL
    CHECK (phase IN ('ledger-recorded', 'quarantined')),
  game_count INTEGER NOT NULL CHECK (game_count >= 0),
  package_revision_count INTEGER NOT NULL CHECK (package_revision_count >= 0),
  artifact_locator_count INTEGER NOT NULL CHECK (artifact_locator_count >= 0),
  release_count INTEGER NOT NULL CHECK (release_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (updated_at >= created_at),
  CHECK (
    (state = 'pending'
      AND phase = 'ledger-recorded'
      AND terminal_receipt IS NULL
      AND completed_at IS NULL)
    OR
    (state = 'completed'
      AND phase = 'quarantined'
      AND terminal_receipt IS NOT NULL
      AND completed_at IS NOT NULL
      AND completed_at >= created_at)
  )
);

CREATE TABLE IF NOT EXISTS sdk_creator_recovery_quarantine_games (
  operation_id UUID NOT NULL
    REFERENCES sdk_creator_recovery_operations(operation_id) ON DELETE RESTRICT,
  game_id UUID NOT NULL REFERENCES sdk_games(id) ON DELETE RESTRICT,
  recovery_state VARCHAR(16) NOT NULL
    CHECK (recovery_state = 'quarantined'),
  visibility VARCHAR(16) NOT NULL
    CHECK (visibility = 'non-public'),
  owner_binding_state VARCHAR(16) NOT NULL
    CHECK (owner_binding_state = 'unbound'),
  grant_state VARCHAR(16) NOT NULL
    CHECK (grant_state = 'blocked'),
  release_state VARCHAR(16) NOT NULL
    CHECK (release_state = 'blocked'),
  publication_state VARCHAR(16) NOT NULL
    CHECK (publication_state = 'blocked'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (operation_id, game_id),
  UNIQUE (game_id)
);

CREATE INDEX IF NOT EXISTS sdk_creator_recovery_quarantine_operation_idx
  ON sdk_creator_recovery_quarantine_games (operation_id, recovery_state);

CREATE INDEX IF NOT EXISTS sdk_creator_recovery_operation_target_idx
  ON sdk_creator_recovery_operations (target_key, created_at);
