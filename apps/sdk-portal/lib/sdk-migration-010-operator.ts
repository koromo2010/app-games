import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { SdkServiceOperationGrant } from "@game-fields/sdk-service-auth";

export const sdkMigration010Name = "010_bounded_creator_quarantine_recovery.sql";
export const sdkMigration010Checksum = "f0ca21664864b5827819873ab4de29b75c9710097bf4a18cf15b069edca71f0c";

export const sdkMigration010Source = `CREATE TABLE IF NOT EXISTS sdk_creator_recovery_operations (
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
  { version: 10, name: sdkMigration010Name, checksum: sdkMigration010Checksum },
]);

const legacyMigration005 = Object.freeze({
  version: 5,
  name: "005_cross_environment_package_artifacts.sql",
  checksum: "ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7",
});

const expectedBefore010Sql = expectedLedger
  .slice(0, 9)
  .map((row) => `(${row.version}, '${row.name}', '${row.checksum}')`)
  .join(",\n        ");

export const sdkMigration010GuardedSql = `DO $sdk_migration_010$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('game-fields-sdk-migration-010-v1'));
  IF to_regclass('public.sdk_schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'SDK_MIGRATION_LEDGER_MISSING';
  END IF;
  IF EXISTS (SELECT 1 FROM sdk_schema_migrations WHERE version > 10) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_LEDGER_AHEAD';
  END IF;
  IF EXISTS (SELECT 1 FROM sdk_schema_migrations WHERE version = 10) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_010_ALREADY_APPLIED';
  END IF;
  IF EXISTS (SELECT 1 FROM sdk_schema_migrations WHERE version < 1) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_LEDGER_INCONSISTENT';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM (VALUES
        ${expectedBefore010Sql}
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
  ) THEN
    RAISE EXCEPTION 'SDK_MIGRATION_LEDGER_INCONSISTENT';
  END IF;

${sdkMigration010Source}
  INSERT INTO sdk_schema_migrations (version, name, checksum)
  VALUES (10, '${sdkMigration010Name}', '${sdkMigration010Checksum}');
END
$sdk_migration_010$;`;

export type SdkMigration010OperatorCode =
  | "SDK_MIGRATION_010_ALREADY_APPLIED"
  | "SDK_MIGRATION_LEDGER_INCONSISTENT"
  | "SDK_MIGRATION_LEDGER_AHEAD"
  | "SDK_MIGRATION_010_TRANSACTION_FAILED"
  | "SDK_MIGRATION_010_POST_COMMIT_READBACK_FAILED"
  | "SDK_OPERATION_GRANT_REPLAY";

export class SdkMigration010OperatorError extends Error {
  readonly code: SdkMigration010OperatorCode;

  constructor(code: SdkMigration010OperatorCode) {
    super(code);
    this.code = code;
  }
}

function canonicalLedgerRow(row: SdkMigrationLedgerRow) {
  const expected = expectedLedger.find((candidate) => candidate.version === row.version);
  if (!expected) return false;
  if (row.name === expected.name && row.checksum === expected.checksum) return true;
  return row.version === legacyMigration005.version
    && row.name === legacyMigration005.name
    && row.checksum === legacyMigration005.checksum;
}

export function assertSdkMigration010Ledger(
  rows: SdkMigrationLedgerRow[],
  phase: "before" | "after",
) {
  const versions = new Set(rows.map((row) => Number(row.version)));
  if (rows.some((row) => Number(row.version) > 10)) {
    throw new SdkMigration010OperatorError("SDK_MIGRATION_LEDGER_AHEAD");
  }
  if (rows.some((row) => !Number.isInteger(Number(row.version)) || Number(row.version) < 1)) {
    throw new SdkMigration010OperatorError("SDK_MIGRATION_LEDGER_INCONSISTENT");
  }
  if (rows.length !== versions.size || rows.some((row) => !canonicalLedgerRow(row))) {
    throw new SdkMigration010OperatorError("SDK_MIGRATION_LEDGER_INCONSISTENT");
  }
  for (let version = 1; version <= 9; version += 1) {
    if (!versions.has(version)) {
      throw new SdkMigration010OperatorError("SDK_MIGRATION_LEDGER_INCONSISTENT");
    }
  }
  if (phase === "before") {
    if (versions.has(10)) {
      throw new SdkMigration010OperatorError("SDK_MIGRATION_010_ALREADY_APPLIED");
    }
    if (rows.length !== 9) {
      throw new SdkMigration010OperatorError("SDK_MIGRATION_LEDGER_INCONSISTENT");
    }
    return;
  }
  if (!versions.has(10) || rows.length !== 10) {
    throw new SdkMigration010OperatorError(
      "SDK_MIGRATION_010_POST_COMMIT_READBACK_FAILED",
    );
  }
}

export type SdkMigration010Database = {
  readLedger(): Promise<SdkMigrationLedgerRow[]>;
  readSchemaVersion(): Promise<number>;
  applyGuardedMigration(): Promise<void>;
};

export function createSdkMigration010Database(
  sql: NeonQueryFunction<boolean, boolean>,
): SdkMigration010Database {
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

    async applyGuardedMigration() {
      await sql.transaction((transactionSql) => [
        transactionSql.query(sdkMigration010GuardedSql),
      ]);
    },
  };
}

export async function executeSdkMigration010ExactlyOnce(
  database: SdkMigration010Database,
) {
  const before = await database.readLedger();
  assertSdkMigration010Ledger(before, "before");
  try {
    await database.applyGuardedMigration();
  } catch (error) {
    if (error instanceof SdkMigration010OperatorError) throw error;
    throw new SdkMigration010OperatorError("SDK_MIGRATION_010_TRANSACTION_FAILED");
  }
  let after: SdkMigrationLedgerRow[];
  try {
    after = await database.readLedger();
  } catch {
    throw new SdkMigration010OperatorError(
      "SDK_MIGRATION_010_POST_COMMIT_READBACK_FAILED",
    );
  }
  assertSdkMigration010Ledger(after, "after");
  let schemaVersion: number;
  try {
    schemaVersion = await database.readSchemaVersion();
  } catch {
    throw new SdkMigration010OperatorError(
      "SDK_MIGRATION_010_POST_COMMIT_READBACK_FAILED",
    );
  }
  if (schemaVersion !== 10) {
    throw new SdkMigration010OperatorError(
      "SDK_MIGRATION_010_POST_COMMIT_READBACK_FAILED",
    );
  }
  return { schemaVersion: 10 as const, migrationVersion: 10 as const };
}

export class SdkOperationGrantReplayGuard {
  private readonly consumed = new Map<string, number>();

  consume(grant: SdkServiceOperationGrant, now = Date.now()) {
    for (const [key, expiresAt] of this.consumed) {
      if (expiresAt <= now) this.consumed.delete(key);
    }
    const key = `${grant.action}:${grant.operationId}:${grant.nonce}`;
    if (this.consumed.has(key)) {
      throw new SdkMigration010OperatorError("SDK_OPERATION_GRANT_REPLAY");
    }
    this.consumed.set(key, grant.expiresAt);
  }
}
