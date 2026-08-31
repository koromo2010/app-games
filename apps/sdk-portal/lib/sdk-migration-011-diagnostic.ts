import type { NeonQueryFunction } from "@neondatabase/serverless";
import {
  compareSdkMigration011Ledger,
  type SdkMigration011LedgerComparison,
  type SdkMigrationLedgerRow,
} from "./sdk-migration-011-ledger.ts";
import {
  isCompleteSdkMigration011ObjectContract,
  sdkMigration011ObjectContractFromRow,
  sdkMigration011ObjectContractSql,
  type SdkMigration011ObjectContract,
} from "./sdk-migration-011-object-contract.ts";

export const sdkMigration011DiagnosticObjectContractSql = sdkMigration011ObjectContractSql;

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
        objectContract: sdkMigration011ObjectContractFromRow(objectRow),
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
  const exact = isCompleteSdkMigration011ObjectContract(snapshot.objectContract);
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
