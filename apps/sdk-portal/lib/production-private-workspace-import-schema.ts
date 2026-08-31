export const productionPrivateWorkspaceImportSchemaStatements = Object.freeze([
  `CREATE TABLE IF NOT EXISTS sdk_production_private_workspace_import_operations (
    operation_id UUID PRIMARY KEY,
    operation_nonce UUID NOT NULL UNIQUE,
    target_key VARCHAR(64) NOT NULL UNIQUE CHECK (target_key = 'moi-lab2'),
    environment VARCHAR(16) NOT NULL CHECK (environment = 'production'),
    intent VARCHAR(64) NOT NULL CHECK (intent = 'production-private-workspace-import-v1'),
    recovery_operation_id UUID NOT NULL CHECK (recovery_operation_id = 'fa5eca14-a961-4bd1-9e68-78a609895971'::UUID),
    recovery_terminal_receipt CHAR(64) NOT NULL CHECK (recovery_terminal_receipt = 'f449b3b2114ef863ea290d26c123a40ac3038e6e9861a3a576cb5bc2b9d35162'),
    plan_receipt CHAR(64) NOT NULL,
    terminal_receipt CHAR(64),
    bundle_bytes INTEGER NOT NULL CHECK (bundle_bytes = 127345),
    bundle_sha256 CHAR(64) NOT NULL CHECK (bundle_sha256 = '71834a0633bb35cb3021c01a758db9f9005f148b790bab9c8b89fd3adb346305'),
    bundle_schema_version INTEGER NOT NULL CHECK (bundle_schema_version = 1),
    game_count INTEGER NOT NULL CHECK (game_count = 2),
    entry_count INTEGER NOT NULL CHECK (entry_count >= 5),
    runtime_file_count INTEGER NOT NULL CHECK (runtime_file_count >= 2),
    runtime_bytes BIGINT NOT NULL CHECK (runtime_bytes > 0),
    game_identity_set_sha256 CHAR(64) NOT NULL,
    per_game_identity_sha256 CHAR(64) NOT NULL,
    content_set_sha256 CHAR(64) NOT NULL,
    workspace_manifest_sha256 CHAR(64) NOT NULL,
    per_game_ledger_sha256 CHAR(64) NOT NULL,
    before_state_sha256 CHAR(64) NOT NULL,
    source_state_token CHAR(64) NOT NULL,
    public_state_token CHAR(64) NOT NULL,
    unrelated_private_state_token CHAR(64) NOT NULL,
    read_back_sha256 CHAR(64),
    state VARCHAR(16) NOT NULL CHECK (state IN ('pending', 'completed')),
    phase VARCHAR(24) NOT NULL CHECK (phase IN ('ledger-recorded', 'imported-private')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CHECK (operation_nonce = operation_id),
    CHECK (updated_at >= created_at),
    CHECK (
      (state = 'pending' AND phase = 'ledger-recorded' AND terminal_receipt IS NULL
        AND read_back_sha256 IS NULL AND completed_at IS NULL)
      OR
      (state = 'completed' AND phase = 'imported-private' AND terminal_receipt IS NOT NULL
        AND read_back_sha256 IS NOT NULL AND completed_at IS NOT NULL AND completed_at >= created_at)
    )
  )`,
  `CREATE TABLE IF NOT EXISTS sdk_production_private_workspaces (
    workspace_id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE
      REFERENCES sdk_production_private_workspace_import_operations(operation_id) ON DELETE RESTRICT,
    target_key VARCHAR(64) NOT NULL UNIQUE CHECK (target_key = 'moi-lab2'),
    environment VARCHAR(16) NOT NULL CHECK (environment = 'production'),
    visibility VARCHAR(24) NOT NULL CHECK (visibility = 'private-quarantined'),
    owner_binding_state VARCHAR(16) NOT NULL CHECK (owner_binding_state = 'unbound'),
    bundle_bytes INTEGER NOT NULL CHECK (bundle_bytes = 127345),
    bundle_sha256 CHAR(64) NOT NULL,
    bundle_schema_version INTEGER NOT NULL CHECK (bundle_schema_version = 1),
    game_count INTEGER NOT NULL CHECK (game_count = 2),
    game_identity_set_sha256 CHAR(64) NOT NULL,
    per_game_identity_sha256 CHAR(64) NOT NULL,
    content_set_sha256 CHAR(64) NOT NULL,
    workspace_manifest_sha256 CHAR(64) NOT NULL,
    per_game_ledger_sha256 CHAR(64) NOT NULL,
    workspace_manifest JSONB NOT NULL CHECK (jsonb_typeof(workspace_manifest) = 'object'),
    grants_created INTEGER NOT NULL DEFAULT 0 CHECK (grants_created = 0),
    releases_created INTEGER NOT NULL DEFAULT 0 CHECK (releases_created = 0),
    publications_created INTEGER NOT NULL DEFAULT 0 CHECK (publications_created = 0),
    aliases_created INTEGER NOT NULL DEFAULT 0 CHECK (aliases_created = 0),
    rooms_created INTEGER NOT NULL DEFAULT 0 CHECK (rooms_created = 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS sdk_production_private_workspace_games (
    workspace_id UUID NOT NULL
      REFERENCES sdk_production_private_workspaces(workspace_id) ON DELETE RESTRICT,
    game_id VARCHAR(64) NOT NULL,
    reconstruction_mode VARCHAR(48) NOT NULL
      CHECK (reconstruction_mode IN ('ARTIFACT_HEAD', 'DEFINITION_BACKED_SEMANTIC_REBUILD')),
    original_revision CHAR(40),
    historical_restoration_claim BOOLEAN NOT NULL CHECK (historical_restoration_claim = FALSE),
    workspace_document_sha256 CHAR(64) NOT NULL,
    provenance_sha256 CHAR(64) NOT NULL,
    runtime_files_sha256 CHAR(64) NOT NULL,
    workspace_document JSONB NOT NULL CHECK (jsonb_typeof(workspace_document) = 'object'),
    runtime_file_count INTEGER NOT NULL CHECK (runtime_file_count > 0),
    runtime_bytes BIGINT NOT NULL CHECK (runtime_bytes > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, game_id),
    CHECK (
      (reconstruction_mode = 'ARTIFACT_HEAD' AND original_revision IS NOT NULL)
      OR (reconstruction_mode = 'DEFINITION_BACKED_SEMANTIC_REBUILD' AND original_revision IS NULL)
    )
  )`,
  `CREATE TABLE IF NOT EXISTS sdk_production_private_workspace_files (
    workspace_id UUID NOT NULL,
    game_id VARCHAR(64) NOT NULL,
    path VARCHAR(1024) NOT NULL CHECK (path <> '' AND path !~ '(^|/)\\.\\.?(/|$)'),
    content_bytes BYTEA NOT NULL,
    byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
    content_sha256 CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, game_id, path),
    FOREIGN KEY (workspace_id, game_id)
      REFERENCES sdk_production_private_workspace_games(workspace_id, game_id) ON DELETE RESTRICT,
    CHECK (octet_length(content_bytes) = byte_length)
  )`,
]);

export const productionPrivateWorkspaceImportObjectNames = Object.freeze([
  "sdk_production_private_workspace_import_operations",
  "sdk_production_private_workspaces",
  "sdk_production_private_workspace_games",
  "sdk_production_private_workspace_files",
] as const);
