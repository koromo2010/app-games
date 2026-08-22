CREATE TABLE IF NOT EXISTS sdk_creator_recovery_operations (
  operation_id UUID PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES sdk_creators(id) ON DELETE RESTRICT,
  target_slug VARCHAR(32) NOT NULL UNIQUE
    CHECK (target_slug = 'moi-lab2'),
  intent VARCHAR(64) NOT NULL
    CHECK (intent = 'bounded-quarantine-reconstruction-v1'),
  plan_receipt CHAR(64) NOT NULL,
  terminal_receipt CHAR(64) NOT NULL,
  state VARCHAR(16) NOT NULL
    CHECK (state IN ('pending', 'completed')),
  phase VARCHAR(24) NOT NULL
    CHECK (phase IN ('ledger-recorded', 'quarantined')),
  game_count INTEGER NOT NULL CHECK (game_count = 2),
  package_revision_count INTEGER NOT NULL CHECK (package_revision_count = 1),
  artifact_locator_count INTEGER NOT NULL CHECK (artifact_locator_count = 2),
  release_count INTEGER NOT NULL CHECK (release_count = 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
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
  publication_state VARCHAR(16) NOT NULL
    CHECK (publication_state = 'blocked'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (operation_id, game_id),
  UNIQUE (game_id)
);

CREATE INDEX IF NOT EXISTS sdk_creator_recovery_quarantine_operation_idx
  ON sdk_creator_recovery_quarantine_games (operation_id, recovery_state);
