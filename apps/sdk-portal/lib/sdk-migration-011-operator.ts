import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { SdkServiceOperationGrant } from "@game-fields/sdk-service-auth";

export const sdkMigration011Name = "011_development_private_workspace_import.sql";
export const sdkMigration011Checksum = "99d1d516bff011502b1aed50c5a4f26b81e2b2354e2eabb1fa31385d3c7a91ef";

export const sdkMigration011Source = String.raw`CREATE TABLE IF NOT EXISTS sdk_development_private_workspace_import_operations (
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
`;

export type SdkMigrationLedgerRow = {
  version: number;
  name: string;
  checksum: string;
};

const expectedLedger = Object.freeze([
  { version: 1, name: "001_sdk_registry.sql", checksum: "5456100f4e2bf5cbba4cdf64bc883699ce0a89971e293c08a353803a1e965117" },
  { version: 2, name: "002_sdk_portal_runtime.sql", checksum: "22a80f2062ff27bcadb0be6e940ee6b32a79d171f74865cd043415acb516ce63" },
  { version: 3, name: "003_immutable_packages_and_lifecycle.sql", checksum: "60c88555bb042c28f5196d7c916ac222fb2ab37ef4294e64b32e5d4ddd2507c5" },
  { version: 4, name: "004_app_release_history.sql", checksum: "51fd28e7b1d2452fe96ba850d1dd7089201031230cdf710733085949099a4571" },
  { version: 5, name: "005_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 6, name: "006_cross_environment_package_artifacts.sql", checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7" },
  { version: 7, name: "007_reconcile_release_decisions.sql", checksum: "242ec4c6fa3004dc8c91605960b5cfe1f0241108d00d114e9cc2f4f494363d34" },
  { version: 8, name: "008_mock_approval_and_authoring_gate.sql", checksum: "e8b31e6debda55d6a70977a5d9c96aa97403983821d52b1ebcd8d1b32b608894" },
  { version: 9, name: "009_module_profile_proposals.sql", checksum: "b7f306bf3d236118d38719722647984119cdb18aec8614cf042fde757f67c723" },
  { version: 10, name: "010_bounded_creator_quarantine_recovery.sql", checksum: "f0ca21664864b5827819873ab4de29b75c9710097bf4a18cf15b069edca71f0c" },
  { version: 11, name: sdkMigration011Name, checksum: sdkMigration011Checksum },
]);

const legacyMigration005 = Object.freeze({
  version: 5,
  name: "005_cross_environment_package_artifacts.sql",
  checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7",
});

const expectedBefore011Sql = expectedLedger
  .slice(0, 10)
  .map((row) => `(${row.version}, '${row.name}', '${row.checksum}')`)
  .join(",\n        ");

const migrationObjectAbsentSql = `
  to_regclass('public.sdk_development_private_workspace_import_operations') IS NULL
  AND to_regclass('public.sdk_development_private_workspaces') IS NULL
  AND to_regclass('public.sdk_development_private_workspace_games') IS NULL
  AND to_regclass('public.sdk_development_private_workspace_files') IS NULL
  AND to_regprocedure(
    'public.sdk_development_private_workspace_import_snapshot(character varying)'
  ) IS NULL
`;

export const sdkMigration011GuardedSql = `DO $sdk_migration_011$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('game-fields-sdk-migration-011-development-v1'));
  IF to_regclass('public.sdk_schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'SDK_MIGRATION_LEDGER_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM sdk_schema_migrations WHERE version > 11) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_LEDGER_AHEAD';
  END IF;
  IF EXISTS (SELECT 1 FROM sdk_schema_migrations WHERE version = 11) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_011_ALREADY_APPLIED';
  END IF;
  IF EXISTS (SELECT 1 FROM sdk_schema_migrations WHERE version < 1) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_LEDGER_INCONSISTENT';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES
        ${expectedBefore011Sql}
    ) AS expected(version, name, checksum)
    LEFT JOIN sdk_schema_migrations AS applied USING (version)
    WHERE applied.version IS NULL
       OR (
         (applied.name <> expected.name OR applied.checksum <> expected.checksum)
         AND NOT (
           expected.version = ${legacyMigration005.version}
           AND applied.name = '${legacyMigration005.name}'
           AND applied.checksum = '${legacyMigration005.checksum}'
         )
       )
  ) OR (SELECT COUNT(*) FROM sdk_schema_migrations) <> 10 THEN
    RAISE EXCEPTION 'SDK_MIGRATION_LEDGER_INCONSISTENT';
  END IF;
  IF NOT (${migrationObjectAbsentSql}) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH';
  END IF;

${sdkMigration011Source}
  INSERT INTO sdk_schema_migrations (version, name, checksum)
  VALUES (11, '${sdkMigration011Name}', '${sdkMigration011Checksum}');
END
$sdk_migration_011$;`;

const expectedColumnsSql = [
  ["sdk_development_private_workspace_import_operations", [
    "operation_id", "operation_nonce", "target_key", "environment", "intent",
    "plan_receipt", "terminal_receipt", "bundle_bytes", "bundle_sha256",
    "bundle_schema_version", "game_count", "game_identity_set_sha256",
    "per_game_identity_sha256", "content_set_sha256", "workspace_manifest_sha256",
    "per_game_ledger_sha256", "runtime_file_count", "runtime_bytes",
    "before_state_sha256", "source_state_token", "public_state_token",
    "unrelated_private_state_token", "read_back_sha256", "state", "phase",
    "created_at", "updated_at", "completed_at",
  ]],
  ["sdk_development_private_workspaces", [
    "workspace_id", "operation_id", "target_key", "environment", "visibility",
    "owner_binding_state", "bundle_bytes", "bundle_sha256", "bundle_schema_version",
    "game_count", "game_identity_set_sha256", "per_game_identity_sha256",
    "content_set_sha256", "workspace_manifest_sha256", "workspace_manifest",
    "grants_created", "releases_created", "publications_created", "aliases_created",
    "rooms_created", "created_at",
  ]],
  ["sdk_development_private_workspace_games", [
    "workspace_id", "game_id", "reconstruction_mode", "original_revision",
    "historical_restoration_claim", "workspace_document_sha256", "provenance_sha256",
    "runtime_files_sha256", "workspace_document", "runtime_file_count",
    "runtime_bytes", "created_at",
  ]],
  ["sdk_development_private_workspace_files", [
    "workspace_id", "game_id", "path", "content_bytes", "byte_length",
    "content_sha256", "created_at",
  ]],
] as const;

const expectedColumnValues = expectedColumnsSql
  .flatMap(([table, columns]) => columns.map((column) => `('${table}', '${column}')`))
  .join(",\n      ");

export const sdkMigration011ObjectContractSql = `
WITH expected_columns(table_name, column_name) AS (
  VALUES
      ${expectedColumnValues}
), actual_columns AS (
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN (
      'sdk_development_private_workspace_import_operations',
      'sdk_development_private_workspaces',
      'sdk_development_private_workspace_games',
      'sdk_development_private_workspace_files'
    )
), object_presence AS (
  SELECT
    (to_regclass('public.sdk_development_private_workspace_import_operations') IS NOT NULL)::integer
    + (to_regclass('public.sdk_development_private_workspaces') IS NOT NULL)::integer
    + (to_regclass('public.sdk_development_private_workspace_games') IS NOT NULL)::integer
    + (to_regclass('public.sdk_development_private_workspace_files') IS NOT NULL)::integer
    + (to_regclass('public.sdk_development_private_workspace_operation_idx') IS NOT NULL)::integer
    + (to_regclass('public.sdk_development_private_workspace_game_idx') IS NOT NULL)::integer
    + (to_regprocedure(
        'public.sdk_development_private_workspace_import_snapshot(character varying)'
      ) IS NOT NULL)::integer AS present_object_count
), index_contract AS (
  SELECT
    COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspace_operation_idx'
        AND indexdef LIKE '%(state, created_at)%'
    ) = 1
    AND COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspace_game_idx'
        AND indexdef LIKE '%(game_id, reconstruction_mode)%'
    ) = 1
    AND COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspace_import_operations_pkey'
    ) = 1
    AND COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspaces_pkey'
    ) = 1
    AND COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspace_games_pkey'
    ) = 1
    AND COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspace_files_pkey'
    ) = 1
    AND COUNT(*) = 10 AS exact
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN (
      'sdk_development_private_workspace_import_operations',
      'sdk_development_private_workspaces',
      'sdk_development_private_workspace_games',
      'sdk_development_private_workspace_files'
    )
), constraint_contract AS (
  SELECT COUNT(*) = 40
    AND bool_and(contype IN ('p', 'u', 'f', 'c')) AS exact
  FROM pg_constraint
  WHERE conrelid IN (
    'public.sdk_development_private_workspace_import_operations'::regclass,
    'public.sdk_development_private_workspaces'::regclass,
    'public.sdk_development_private_workspace_games'::regclass,
    'public.sdk_development_private_workspace_files'::regclass
  )
), function_contract AS (
  SELECT COUNT(*) = 1
    AND bool_and(p.provolatile = 's')
    AND bool_and(p.proretset)
    AND bool_and(l.lanname = 'sql')
    AND bool_and(position('target_creators AS MATERIALIZED' in p.prosrc) > 0)
    AND bool_and(position('sdk_development_private_workspaces' in p.prosrc) > 0)
    AND bool_and(position('unrelated_private_state_token' in pg_get_function_result(p.oid)) > 0)
      AS exact
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.proname = 'sdk_development_private_workspace_import_snapshot'
    AND pg_get_function_identity_arguments(p.oid) = 'p_target character varying'
)
SELECT
  object_presence.present_object_count AS "presentObjectCount",
  (
    (SELECT COUNT(*) FROM actual_columns) = 68
    AND NOT EXISTS (
      SELECT table_name, column_name FROM expected_columns
      EXCEPT
      SELECT table_name, column_name FROM actual_columns
    )
    AND NOT EXISTS (
      SELECT table_name, column_name FROM actual_columns
      EXCEPT
      SELECT table_name, column_name FROM expected_columns
    )
  ) AS "columnsExact",
  index_contract.exact AS "indexesExact",
  constraint_contract.exact AS "constraintsExact",
  function_contract.exact AS "functionExact"
FROM object_presence, index_contract, constraint_contract, function_contract
`;

export type SdkMigration011ObjectContract = {
  presentObjectCount: number;
  columnsExact: boolean;
  indexesExact: boolean;
  constraintsExact: boolean;
  functionExact: boolean;
};

export const emptySdkMigration011ObjectContract: SdkMigration011ObjectContract = {
  presentObjectCount: 0,
  columnsExact: false,
  indexesExact: false,
  constraintsExact: false,
  functionExact: false,
};

export const completeSdkMigration011ObjectContract: SdkMigration011ObjectContract = {
  presentObjectCount: 7,
  columnsExact: true,
  indexesExact: true,
  constraintsExact: true,
  functionExact: true,
};

export type SdkMigration011OperatorCode =
  | "SDK_MIGRATION_LEDGER_INCONSISTENT"
  | "SDK_MIGRATION_LEDGER_AHEAD"
  | "SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH"
  | "SDK_MIGRATION_011_TRANSACTION_FAILED"
  | "SDK_MIGRATION_011_POST_COMMIT_READBACK_FAILED"
  | "SDK_OPERATION_GRANT_REPLAY";

export class SdkMigration011OperatorError extends Error {
  readonly code: SdkMigration011OperatorCode;

  constructor(code: SdkMigration011OperatorCode) {
    super(code);
    this.code = code;
  }
}

function canonicalLedgerRow(row: SdkMigrationLedgerRow) {
  const expected = expectedLedger.find((candidate) => candidate.version === Number(row.version));
  if (!expected) return false;
  if (row.name === expected.name && row.checksum === expected.checksum) return true;
  return Number(row.version) === legacyMigration005.version
    && row.name === legacyMigration005.name
    && row.checksum === legacyMigration005.checksum;
}

export function assertSdkMigration011Ledger(
  rows: SdkMigrationLedgerRow[],
  phase: "before" | "after",
) {
  const normalized = rows.map((row) => ({ ...row, version: Number(row.version) }));
  const versions = new Set(normalized.map((row) => row.version));
  if (normalized.some((row) => row.version > 11)) {
    throw new SdkMigration011OperatorError("SDK_MIGRATION_LEDGER_AHEAD");
  }
  if (
    normalized.some((row) => !Number.isInteger(row.version) || row.version < 1)
    || normalized.length !== versions.size
    || normalized.some((row) => !canonicalLedgerRow(row))
  ) {
    throw new SdkMigration011OperatorError("SDK_MIGRATION_LEDGER_INCONSISTENT");
  }
  const expectedLength = phase === "before" ? 10 : 11;
  if (normalized.length !== expectedLength) {
    throw new SdkMigration011OperatorError("SDK_MIGRATION_LEDGER_INCONSISTENT");
  }
  for (let version = 1; version <= expectedLength; version += 1) {
    if (!versions.has(version)) {
      throw new SdkMigration011OperatorError("SDK_MIGRATION_LEDGER_INCONSISTENT");
    }
  }
}

export function assertSdkMigration011Objects(
  contract: SdkMigration011ObjectContract,
  phase: "before" | "after",
) {
  if (phase === "before") {
    if (contract.presentObjectCount !== 0) {
      throw new SdkMigration011OperatorError(
        "SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH",
      );
    }
    return;
  }
  if (
    contract.presentObjectCount !== completeSdkMigration011ObjectContract.presentObjectCount
    || !contract.columnsExact
    || !contract.indexesExact
    || !contract.constraintsExact
    || !contract.functionExact
  ) {
    throw new SdkMigration011OperatorError(
      "SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH",
    );
  }
}

export type SdkMigration011Database = {
  readLedger(): Promise<SdkMigrationLedgerRow[]>;
  readSchemaVersion(): Promise<number>;
  readObjectContract(): Promise<SdkMigration011ObjectContract>;
  applyGuardedMigration(): Promise<void>;
};

export function createSdkMigration011Database(
  sql: NeonQueryFunction<boolean, boolean>,
): SdkMigration011Database {
  return {
    async readLedger() {
      return await sql`
        SELECT version, name, checksum
        FROM sdk_schema_migrations
        ORDER BY version
      ` as SdkMigrationLedgerRow[];
    },
    async readSchemaVersion() {
      const rows = await sql`
        SELECT COALESCE(MAX(version), 0)::integer AS version
        FROM sdk_schema_migrations
      ` as { version: number }[];
      return Number(rows[0]?.version ?? 0);
    },
    async readObjectContract() {
      const rows = await sql.query(sdkMigration011ObjectContractSql) as Array<{
        presentObjectCount?: number | string;
        columnsExact?: boolean;
        indexesExact?: boolean;
        constraintsExact?: boolean;
        functionExact?: boolean;
      }>;
      const row = rows[0] ?? {};
      return {
        presentObjectCount: Number(row.presentObjectCount ?? 0),
        columnsExact: row.columnsExact === true,
        indexesExact: row.indexesExact === true,
        constraintsExact: row.constraintsExact === true,
        functionExact: row.functionExact === true,
      };
    },
    async applyGuardedMigration() {
      await sql.transaction((transactionSql) => [
        transactionSql.query(sdkMigration011GuardedSql),
      ]);
    },
  };
}

export type SdkMigration011ExecutionResult = {
  status: "APPLIED" | "ALREADY_APPLIED_MATCH";
  schemaVersion: 11;
  migrationVersion: 11;
  writesPerformed: 0 | 1;
};

async function readAfterState(database: SdkMigration011Database) {
  let ledger: SdkMigrationLedgerRow[];
  let schemaVersion: number;
  let objects: SdkMigration011ObjectContract;
  try {
    [ledger, schemaVersion, objects] = await Promise.all([
      database.readLedger(),
      database.readSchemaVersion(),
      database.readObjectContract(),
    ]);
  } catch {
    throw new SdkMigration011OperatorError(
      "SDK_MIGRATION_011_POST_COMMIT_READBACK_FAILED",
    );
  }
  try {
    assertSdkMigration011Ledger(ledger, "after");
    assertSdkMigration011Objects(objects, "after");
  } catch {
    throw new SdkMigration011OperatorError(
      "SDK_MIGRATION_011_POST_COMMIT_READBACK_FAILED",
    );
  }
  if (schemaVersion !== 11) {
    throw new SdkMigration011OperatorError(
      "SDK_MIGRATION_011_POST_COMMIT_READBACK_FAILED",
    );
  }
}

export async function executeSdkMigration011ExactlyOnce(
  database: SdkMigration011Database,
): Promise<SdkMigration011ExecutionResult> {
  const before = await database.readLedger();
  const alreadyApplied = before.some((row) => Number(row.version) === 11);
  if (alreadyApplied) {
    await readAfterState(database);
    return {
      status: "ALREADY_APPLIED_MATCH",
      schemaVersion: 11,
      migrationVersion: 11,
      writesPerformed: 0,
    };
  }
  assertSdkMigration011Ledger(before, "before");
  const beforeObjects = await database.readObjectContract();
  assertSdkMigration011Objects(beforeObjects, "before");
  try {
    await database.applyGuardedMigration();
  } catch {
    throw new SdkMigration011OperatorError("SDK_MIGRATION_011_TRANSACTION_FAILED");
  }
  await readAfterState(database);
  return {
    status: "APPLIED",
    schemaVersion: 11,
    migrationVersion: 11,
    writesPerformed: 1,
  };
}

export class SdkMigration011OperationGrantReplayGuard {
  private readonly consumed = new Map<string, number>();

  consume(grant: SdkServiceOperationGrant, now = Date.now()) {
    for (const [key, expiresAt] of this.consumed) {
      if (expiresAt <= now) this.consumed.delete(key);
    }
    const key = `${grant.action}:${grant.operationId}:${grant.nonce}`;
    if (this.consumed.has(key)) {
      throw new SdkMigration011OperatorError("SDK_OPERATION_GRANT_REPLAY");
    }
    this.consumed.set(key, grant.expiresAt);
  }
}
