import type { NeonQueryFunction } from "@neondatabase/serverless";
import {
  compareSdkMigration011Ledger,
  type SdkMigration011LedgerComparison,
  type SdkMigrationLedgerRow,
} from "./sdk-migration-011-ledger.ts";
import type { SdkMigration011ObjectContract } from "./sdk-migration-011-operator.ts";

export const sdkMigration011DiagnosticObjectContractSql = `
WITH target_tables(name) AS (
  VALUES
    ('sdk_development_private_workspace_import_operations'),
    ('sdk_development_private_workspaces'),
    ('sdk_development_private_workspace_games'),
    ('sdk_development_private_workspace_files')
), target_relations AS (
  SELECT c.oid, c.relname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN target_tables t ON t.name = c.relname
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
), object_presence AS (
  SELECT
    (SELECT COUNT(*) FROM target_relations)::integer
    + (to_regclass('public.sdk_development_private_workspace_operation_idx') IS NOT NULL)::integer
    + (to_regclass('public.sdk_development_private_workspace_game_idx') IS NOT NULL)::integer
    + (to_regprocedure(
        'public.sdk_development_private_workspace_import_snapshot(character varying)'
      ) IS NOT NULL)::integer AS present_object_count
), column_contract AS (
  SELECT COUNT(*) = 68 AS exact
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN (SELECT name FROM target_tables)
), index_contract AS (
  SELECT COUNT(*) = 10
    AND COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspace_operation_idx'
        AND indexdef LIKE '%(state, created_at)%'
    ) = 1
    AND COUNT(*) FILTER (
      WHERE indexname = 'sdk_development_private_workspace_game_idx'
        AND indexdef LIKE '%(game_id, reconstruction_mode)%'
    ) = 1 AS exact
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN (SELECT name FROM target_tables)
), constraint_contract AS (
  SELECT COUNT(*) = 40
    AND COALESCE(bool_and(con.contype IN ('p', 'u', 'f', 'c')), false) AS exact
  FROM pg_constraint con
  WHERE con.conrelid IN (SELECT oid FROM target_relations)
), function_contract AS (
  SELECT COUNT(*) = 1
    AND COALESCE(bool_and(p.provolatile = 's'), false)
    AND COALESCE(bool_and(p.proretset), false)
    AND COALESCE(bool_and(l.lanname = 'sql'), false)
    AND COALESCE(bool_and(position('target_creators AS MATERIALIZED' in p.prosrc) > 0), false)
    AND COALESCE(bool_and(position('sdk_development_private_workspaces' in p.prosrc) > 0), false)
    AND COALESCE(bool_and(position('unrelated_private_state_token' in pg_get_function_result(p.oid)) > 0), false)
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
  column_contract.exact AS "columnsExact",
  index_contract.exact AS "indexesExact",
  constraint_contract.exact AS "constraintsExact",
  function_contract.exact AS "functionExact"
FROM object_presence, column_contract, index_contract, constraint_contract, function_contract
`;

export type SdkMigration011DiagnosticDatabase = {
  readSnapshot(): Promise<{
    ledger: SdkMigrationLedgerRow[];
    observedSchemaVersion: number;
    objectContract: SdkMigration011ObjectContract;
  }>;
};

export function createSdkMigration011DiagnosticDatabase(
  sql: NeonQueryFunction<boolean, boolean>,
): SdkMigration011DiagnosticDatabase {
  return {
    async readSnapshot() {
      const [ledgerResult, schemaResult, objectResult] = await sql.transaction((tx) => [
        tx`SELECT version, name, checksum FROM sdk_schema_migrations ORDER BY version, name, checksum`,
        tx`SELECT COALESCE(MAX(version), 0)::integer AS version FROM sdk_schema_migrations`,
        tx.query(sdkMigration011DiagnosticObjectContractSql),
      ], { isolationLevel: "RepeatableRead", readOnly: true }) as unknown[];
      const objectRow = ((objectResult as Record<string, unknown>[])[0] ?? {});
      return {
        ledger: (ledgerResult as SdkMigrationLedgerRow[]).map((row) => ({
          version: Number(row.version),
          name: String(row.name),
          checksum: String(row.checksum),
        })),
        observedSchemaVersion: Number(
          (schemaResult as Array<{ version?: number | string }>)[0]?.version ?? 0,
        ),
        objectContract: {
          presentObjectCount: Number(objectRow.presentObjectCount ?? 0),
          columnsExact: objectRow.columnsExact === true,
          indexesExact: objectRow.indexesExact === true,
          constraintsExact: objectRow.constraintsExact === true,
          functionExact: objectRow.functionExact === true,
        },
      };
    },
  };
}

export type SdkMigration011DiagnosticResult = {
  observedSchemaVersion: number;
  ledger: SdkMigrationLedgerRow[];
  comparison: SdkMigration011LedgerComparison;
  objectContract: SdkMigration011ObjectContract & {
    state: "ABSENT" | "PARTIAL" | "COMPLETE";
  };
};

export async function diagnoseSdkMigration011Ledger(
  database: SdkMigration011DiagnosticDatabase,
): Promise<SdkMigration011DiagnosticResult> {
  const snapshot = await database.readSnapshot();
  const exact = snapshot.objectContract.presentObjectCount === 7
    && snapshot.objectContract.columnsExact
    && snapshot.objectContract.indexesExact
    && snapshot.objectContract.constraintsExact
    && snapshot.objectContract.functionExact;
  return {
    observedSchemaVersion: snapshot.observedSchemaVersion,
    ledger: snapshot.ledger,
    comparison: compareSdkMigration011Ledger(snapshot.ledger),
    objectContract: {
      ...snapshot.objectContract,
      state: snapshot.objectContract.presentObjectCount === 0
        ? "ABSENT"
        : exact ? "COMPLETE" : "PARTIAL",
    },
  };
}
