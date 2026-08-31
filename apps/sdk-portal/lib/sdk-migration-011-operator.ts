import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { SdkServiceOperationGrant } from "@game-fields/sdk-service-auth";
import {
  compareSdkMigration011Ledger,
  sdkMigration011AcceptedLegacy005 as legacyMigration005,
  sdkMigration011AcceptedLegacy010 as legacyMigration010,
  sdkMigration011CanonicalLedger as expectedLedger,
  sdkMigration011Checksum,
  sdkMigration011Name,
  type SdkMigrationLedgerRow,
} from "./sdk-migration-011-ledger.ts";
import {
  isCompleteSdkMigration011ObjectContract,
  readSdkMigration011ObjectContract,
  sdkMigration011CompleteContractPredicateSql,
  type SdkMigration011ObjectContract,
} from "./sdk-migration-011-object-contract.ts";

export { sdkMigration011Checksum, sdkMigration011Name } from "./sdk-migration-011-ledger.ts";
export type { SdkMigrationLedgerRow } from "./sdk-migration-011-ledger.ts";
export {
  completeSdkMigration011ObjectContract,
  emptySdkMigration011ObjectContract,
  sdkMigration011ExpectedConstraintCount,
  sdkMigration011ExpectedConstraints,
  sdkMigration011ObjectContractSql,
} from "./sdk-migration-011-object-contract.ts";
export type { SdkMigration011ObjectContract } from "./sdk-migration-011-object-contract.ts";

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
         AND NOT (
           expected.version = ${legacyMigration010.version}
           AND applied.name = '${legacyMigration010.name}'
           AND applied.checksum = '${legacyMigration010.checksum}'
         )
       )
  ) OR (SELECT COUNT(*) FROM sdk_schema_migrations) <> 10 THEN
    RAISE EXCEPTION 'SDK_MIGRATION_LEDGER_INCONSISTENT';
  END IF;
  IF NOT (${migrationObjectAbsentSql}) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH';
  END IF;

${sdkMigration011Source}
  IF NOT (${sdkMigration011CompleteContractPredicateSql}) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH';
  END IF;
  INSERT INTO sdk_schema_migrations (version, name, checksum)
  VALUES (11, '${sdkMigration011Name}', '${sdkMigration011Checksum}');
END
$sdk_migration_011$;`;

export type SdkMigration011OperatorCode =
  | "SDK_MIGRATION_LEDGER_INCONSISTENT"
  | "SDK_MIGRATION_LEDGER_AHEAD"
  | "SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH"
  | "SDK_MIGRATION_011_PREFLIGHT_READ_FAILED"
  | "SDK_MIGRATION_011_TRANSACTION_FAILED"
  | "SDK_MIGRATION_011_POST_COMMIT_READBACK_FAILED"
  | "SDK_MIGRATION_011_OPERATOR_FAILED"
  | "SDK_OPERATION_GRANT_REPLAY";

export class SdkMigration011OperatorError extends Error {
  readonly code: SdkMigration011OperatorCode;

  constructor(code: SdkMigration011OperatorCode) {
    super(code);
    this.code = code;
  }
}

export function assertSdkMigration011Ledger(
  rows: SdkMigrationLedgerRow[],
  phase: "before" | "after",
) {
  const normalized = rows.map((row) => ({ ...row, version: Number(row.version) }));
  if (normalized.some((row) => row.version > 11)) {
    throw new SdkMigration011OperatorError("SDK_MIGRATION_LEDGER_AHEAD");
  }
  const expectedLength = phase === "before" ? 10 : 11;
  const beforeComparison = compareSdkMigration011Ledger(
    normalized.filter((row) => row.version <= 10),
  );
  const version11 = normalized.find((row) => row.version === 11);
  const canonical11 = expectedLedger[10];
  if (
    !beforeComparison.consistent
    || normalized.length !== expectedLength
    || (phase === "after" && (
      !version11
      || version11.name !== canonical11.name
      || version11.checksum !== canonical11.checksum
    ))
  ) {
    throw new SdkMigration011OperatorError("SDK_MIGRATION_LEDGER_INCONSISTENT");
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
  if (!isCompleteSdkMigration011ObjectContract(contract)) {
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
      return readSdkMigration011ObjectContract(sql);
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
  let before: SdkMigrationLedgerRow[];
  try {
    before = await database.readLedger();
  } catch {
    throw new SdkMigration011OperatorError(
      "SDK_MIGRATION_011_PREFLIGHT_READ_FAILED",
    );
  }
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
  let beforeObjects: SdkMigration011ObjectContract;
  try {
    beforeObjects = await database.readObjectContract();
  } catch {
    throw new SdkMigration011OperatorError(
      "SDK_MIGRATION_011_PREFLIGHT_READ_FAILED",
    );
  }
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
