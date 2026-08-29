CREATE TABLE IF NOT EXISTS sdk_development_private_workspace_import_operations (
  operation_id UUID PRIMARY KEY,
  operation_nonce UUID NOT NULL UNIQUE,
  target_key VARCHAR(64) NOT NULL UNIQUE
    CHECK (target_key IN ('moi-lab2', 'yabobojpn-lab')),
  environment VARCHAR(16) NOT NULL
    CHECK (environment = 'development'),
  intent VARCHAR(64) NOT NULL
    CHECK (intent = 'development-private-workspace-import-v1'),
  plan_receipt CHAR(64) NOT NULL,
  terminal_receipt CHAR(64),
  bundle_bytes INTEGER NOT NULL CHECK (bundle_bytes > 0),
  bundle_sha256 CHAR(64) NOT NULL,
  bundle_schema_version INTEGER NOT NULL CHECK (bundle_schema_version = 1),
  game_count INTEGER NOT NULL CHECK (game_count IN (2, 5)),
  game_identity_set_sha256 CHAR(64) NOT NULL,
  per_game_identity_sha256 CHAR(64) NOT NULL,
  content_set_sha256 CHAR(64) NOT NULL,
  workspace_manifest_sha256 CHAR(64) NOT NULL,
  per_game_ledger_sha256 CHAR(64) NOT NULL,
  runtime_file_count INTEGER NOT NULL CHECK (runtime_file_count > 0),
  runtime_bytes INTEGER NOT NULL CHECK (runtime_bytes > 0),
  before_state_sha256 CHAR(64) NOT NULL,
  source_state_token CHAR(64) NOT NULL,
  public_state_token CHAR(64) NOT NULL,
  unrelated_private_state_token CHAR(64) NOT NULL,
  read_back_sha256 CHAR(64),
  state VARCHAR(16) NOT NULL CHECK (state IN ('pending', 'completed')),
  phase VARCHAR(32) NOT NULL CHECK (phase IN ('ledger-recorded', 'imported-private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (updated_at >= created_at),
  CHECK (
    (state = 'pending'
      AND phase = 'ledger-recorded'
      AND terminal_receipt IS NULL
      AND read_back_sha256 IS NULL
      AND completed_at IS NULL)
    OR
    (state = 'completed'
      AND phase = 'imported-private'
      AND terminal_receipt IS NOT NULL
      AND read_back_sha256 IS NOT NULL
      AND completed_at IS NOT NULL
      AND completed_at >= created_at)
  )
);

CREATE TABLE IF NOT EXISTS sdk_development_private_workspaces (
  workspace_id UUID PRIMARY KEY,
  operation_id UUID NOT NULL UNIQUE
    REFERENCES sdk_development_private_workspace_import_operations(operation_id) ON DELETE RESTRICT,
  target_key VARCHAR(64) NOT NULL UNIQUE,
  environment VARCHAR(16) NOT NULL CHECK (environment = 'development'),
  visibility VARCHAR(24) NOT NULL CHECK (visibility = 'private-quarantined'),
  owner_binding_state VARCHAR(16) NOT NULL CHECK (owner_binding_state = 'unbound'),
  bundle_bytes INTEGER NOT NULL CHECK (bundle_bytes > 0),
  bundle_sha256 CHAR(64) NOT NULL,
  bundle_schema_version INTEGER NOT NULL CHECK (bundle_schema_version = 1),
  game_count INTEGER NOT NULL CHECK (game_count IN (2, 5)),
  game_identity_set_sha256 CHAR(64) NOT NULL,
  per_game_identity_sha256 CHAR(64) NOT NULL,
  content_set_sha256 CHAR(64) NOT NULL,
  workspace_manifest_sha256 CHAR(64) NOT NULL,
  workspace_manifest JSONB NOT NULL,
  grants_created INTEGER NOT NULL DEFAULT 0 CHECK (grants_created = 0),
  releases_created INTEGER NOT NULL DEFAULT 0 CHECK (releases_created = 0),
  publications_created INTEGER NOT NULL DEFAULT 0 CHECK (publications_created = 0),
  aliases_created INTEGER NOT NULL DEFAULT 0 CHECK (aliases_created = 0),
  rooms_created INTEGER NOT NULL DEFAULT 0 CHECK (rooms_created = 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (target_key = 'moi-lab2' AND game_count = 2)
    OR (target_key = 'yabobojpn-lab' AND game_count = 5)
  )
);

CREATE TABLE IF NOT EXISTS sdk_development_private_workspace_games (
  workspace_id UUID NOT NULL
    REFERENCES sdk_development_private_workspaces(workspace_id) ON DELETE RESTRICT,
  game_id VARCHAR(64) NOT NULL
    CHECK (game_id ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  reconstruction_mode VARCHAR(48) NOT NULL
    CHECK (reconstruction_mode IN ('ARTIFACT_HEAD', 'DEFINITION_BACKED_SEMANTIC_REBUILD')),
  original_revision CHAR(40),
  historical_restoration_claim BOOLEAN NOT NULL DEFAULT FALSE
    CHECK (historical_restoration_claim = FALSE),
  workspace_document_sha256 CHAR(64) NOT NULL,
  provenance_sha256 CHAR(64) NOT NULL,
  runtime_files_sha256 CHAR(64) NOT NULL,
  workspace_document JSONB NOT NULL,
  runtime_file_count INTEGER NOT NULL CHECK (runtime_file_count > 0),
  runtime_bytes INTEGER NOT NULL CHECK (runtime_bytes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, game_id),
  CHECK (
    (reconstruction_mode = 'ARTIFACT_HEAD' AND original_revision IS NOT NULL)
    OR
    (reconstruction_mode = 'DEFINITION_BACKED_SEMANTIC_REBUILD' AND original_revision IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS sdk_development_private_workspace_files (
  workspace_id UUID NOT NULL,
  game_id VARCHAR(64) NOT NULL,
  path VARCHAR(1024) NOT NULL,
  content_bytes BYTEA NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0 AND byte_length <= 2097152),
  content_sha256 CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, game_id, path),
  FOREIGN KEY (workspace_id, game_id)
    REFERENCES sdk_development_private_workspace_games(workspace_id, game_id) ON DELETE RESTRICT,
  CHECK (octet_length(content_bytes) = byte_length),
  CHECK (
    path !~ '(^/|\\\\|(^|/)\.\.?(/|$)|\x00)'
  )
);

CREATE INDEX IF NOT EXISTS sdk_development_private_workspace_operation_idx
  ON sdk_development_private_workspace_import_operations (state, created_at);

CREATE INDEX IF NOT EXISTS sdk_development_private_workspace_game_idx
  ON sdk_development_private_workspace_games (game_id, reconstruction_mode);

CREATE OR REPLACE FUNCTION sdk_development_private_workspace_import_snapshot(p_target VARCHAR)
RETURNS TABLE (
  target_creator_row_id UUID,
  target_creator_rows INTEGER,
  target_deleted_creator_rows INTEGER,
  target_creator_owner_rows INTEGER,
  target_game_rows INTEGER,
  target_deleted_game_rows INTEGER,
  target_active_game_rows INTEGER,
  target_release_rows INTEGER,
  target_current_release_rows INTEGER,
  target_workspace_rows INTEGER,
  target_workspace_game_rows INTEGER,
  target_workspace_file_rows INTEGER,
  source_state_token CHAR(64),
  public_state_token CHAR(64),
  unrelated_private_state_token CHAR(64)
)
LANGUAGE SQL
STABLE
AS $snapshot$
  WITH target_creators AS MATERIALIZED (
    SELECT * FROM sdk_creators WHERE slug = p_target
  ), target_games AS MATERIALIZED (
    SELECT * FROM sdk_games WHERE creator_id IN (SELECT id FROM target_creators)
  ), target_packages AS MATERIALIZED (
    SELECT * FROM sdk_game_package_revisions
    WHERE game_id IN (SELECT id FROM target_games)
  ), target_releases AS MATERIALIZED (
    SELECT * FROM sdk_app_releases WHERE source_creator_slug = p_target
  ), target_workspaces AS MATERIALIZED (
    SELECT * FROM sdk_development_private_workspaces WHERE target_key = p_target
  ), source_text AS (
    SELECT concat_ws('||',
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM target_creators r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM target_games r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY game_id, revision) FROM target_packages r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM target_releases r), '')
    ) AS value
  ), public_text AS (
    SELECT concat_ws('||',
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM sdk_app_releases r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM sdk_release_decisions r), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY id) FROM sdk_oauth_grants r), '')
    ) AS value
  ), unrelated_private_text AS (
    SELECT concat_ws('||',
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY operation_id)
        FROM sdk_development_private_workspace_import_operations r WHERE target_key <> p_target), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY workspace_id)
        FROM sdk_development_private_workspaces r WHERE target_key <> p_target), ''),
      COALESCE((SELECT string_agg(row_to_json(r)::TEXT, ',' ORDER BY workspace_id, game_id)
        FROM sdk_development_private_workspace_games r
        WHERE workspace_id IN (SELECT workspace_id FROM sdk_development_private_workspaces WHERE target_key <> p_target)), ''),
      COALESCE((SELECT string_agg(concat_ws('|', workspace_id::TEXT, game_id, path, byte_length::TEXT, content_sha256), ','
        ORDER BY workspace_id, game_id, path) FROM sdk_development_private_workspace_files
        WHERE workspace_id IN (SELECT workspace_id FROM sdk_development_private_workspaces WHERE target_key <> p_target)), '')
    ) AS value
  )
  SELECT
    (SELECT id FROM target_creators ORDER BY id LIMIT 1),
    (SELECT COUNT(*) FROM target_creators)::INTEGER,
    (SELECT COUNT(*) FROM target_creators WHERE deleted_at IS NOT NULL)::INTEGER,
    (SELECT COUNT(*) FROM target_creators WHERE owner_player_id IS NOT NULL)::INTEGER,
    (SELECT COUNT(*) FROM target_games)::INTEGER,
    (SELECT COUNT(*) FROM target_games WHERE deleted_at IS NOT NULL)::INTEGER,
    (SELECT COUNT(*) FROM target_games WHERE deleted_at IS NULL)::INTEGER,
    (SELECT COUNT(*) FROM target_releases)::INTEGER,
    (SELECT COUNT(*) FROM target_releases WHERE is_current)::INTEGER,
    (SELECT COUNT(*) FROM target_workspaces)::INTEGER,
    (SELECT COUNT(*) FROM sdk_development_private_workspace_games
      WHERE workspace_id IN (SELECT workspace_id FROM target_workspaces))::INTEGER,
    (SELECT COUNT(*) FROM sdk_development_private_workspace_files
      WHERE workspace_id IN (SELECT workspace_id FROM target_workspaces))::INTEGER,
    (SELECT md5(value) || md5('source|' || value) FROM source_text)::CHAR(64),
    (SELECT md5(value) || md5('public|' || value) FROM public_text)::CHAR(64),
    (SELECT md5(value) || md5('private|' || value) FROM unrelated_private_text)::CHAR(64)
$snapshot$;
