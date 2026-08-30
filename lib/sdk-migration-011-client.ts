export type SdkMigration011Success = {
  kind: "success";
  status: "APPLIED" | "ALREADY_APPLIED_MATCH";
  migrationVersion: 11;
  observedSchemaVersion: 11;
  writesPerformed: 0 | 1;
};

export type SdkMigration011Stopped = {
  kind: "stopped";
  code: string;
};

export type SdkMigration011ClientResult =
  | SdkMigration011Success
  | SdkMigration011Stopped
  | { kind: "failed"; code: "INVALID_RESPONSE" | "TRANSPORT_FAILED" }
  | { kind: "blocked"; code: "ALREADY_ATTEMPTED" };

type MigrationFetch = typeof fetch;

const developmentDatabaseTargetFingerprint = "43a021d13864615b4b73b65847e2e8e41a4de31cd5793fd6ab36c9acf507da0b";
const developmentDatabaseNameFingerprint = "693fe5919fc229a2cf404ad99e03e8e9277fa4a6d34e88a0d4224d81b0b057a8";

const successKeys = [
  "schemaVersion", "task", "phase", "status", "operation", "operationId",
  "environment", "databaseSelectorKey", "databaseFallbackUsed",
  "databaseTargetFingerprint", "databaseNameFingerprint", "migrationVersion",
  "observedSchemaVersion", "writesPerformed", "secretFree",
] as const;
const stoppedKeys = ["schemaVersion", "task", "phase", "status", "code", "secretFree"] as const;
const acceptedStoppedCodes = new Set([
  "SITE_ADMIN_STEP_UP_REQUIRED",
  "DEVELOPMENT_RUNTIME_REQUIRED",
  "OPERATOR_INPUT_NOT_ALLOWED",
  "SDK_OPERATION_GRANT_REQUIRED",
  "SDK_OPERATION_GRANT_REPLAY",
  "SDK_DATABASE_SELECTOR_NOT_EXACT",
  "SDK_DATABASE_FINGERPRINT_MISMATCH",
  "SDK_MIGRATION_LEDGER_AHEAD",
  "SDK_MIGRATION_LEDGER_INCONSISTENT",
  "SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH",
  "SDK_MIGRATION_011_TRANSACTION_FAILED",
  "SDK_MIGRATION_011_POST_COMMIT_READBACK_FAILED",
  "SDK_MIGRATION_011_UNAVAILABLE",
  "SDK_MIGRATION_011_INVALID_RESPONSE",
]);

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function uuid(value: unknown) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function projectMigration011Response(response: Response, payload: unknown): Exclude<SdkMigration011ClientResult, { kind: "blocked" }> {
  if (exactObject(payload, successKeys)) {
    const acceptedStatus = payload.status === "APPLIED" || payload.status === "ALREADY_APPLIED_MATCH"
      ? payload.status
      : null;
    const expectedWrites = acceptedStatus === "APPLIED"
      ? 1
      : acceptedStatus === "ALREADY_APPLIED_MATCH"
        ? 0
        : null;
    if (
      response.status === 200
      && acceptedStatus !== null
      && expectedWrites !== null
      && payload.schemaVersion === 1
      && payload.task === "T-131-A4"
      && payload.phase === "T-131-A4-v008"
      && payload.operation === "SDK_MIGRATION_011"
      && uuid(payload.operationId)
      && payload.environment === "development"
      && payload.databaseSelectorKey === "POSTGRES_PRISMA_URL"
      && payload.databaseFallbackUsed === true
      && payload.databaseTargetFingerprint === developmentDatabaseTargetFingerprint
      && payload.databaseNameFingerprint === developmentDatabaseNameFingerprint
      && payload.migrationVersion === 11
      && payload.observedSchemaVersion === 11
      && payload.writesPerformed === expectedWrites
      && payload.secretFree === true
    ) {
      return {
        kind: "success",
        status: acceptedStatus,
        migrationVersion: 11,
        observedSchemaVersion: 11,
        writesPerformed: expectedWrites,
      };
    }
  }
  if (
    exactObject(payload, stoppedKeys)
    && response.status >= 400
    && response.status < 600
    && payload.schemaVersion === 1
    && payload.task === "T-131-A4"
    && payload.phase === "T-131-A4-v008"
    && payload.status === "STOPPED"
    && typeof payload.code === "string"
    && acceptedStoppedCodes.has(payload.code)
    && payload.secretFree === true
  ) {
    return { kind: "stopped", code: payload.code };
  }
  return { kind: "failed", code: "INVALID_RESPONSE" };
}

export function createSingleUseMigration011Submitter(fetcher: MigrationFetch = fetch) {
  let attempted = false;
  return async (): Promise<SdkMigration011ClientResult> => {
    if (attempted) return { kind: "blocked", code: "ALREADY_ATTEMPTED" };
    attempted = true;
    try {
      const response = await fetcher("/api/admin/sdk-migration-011", { method: "POST" });
      const payload = await response.json().catch(() => null) as unknown;
      return projectMigration011Response(response, payload);
    } catch {
      return { kind: "failed", code: "TRANSPORT_FAILED" };
    }
  };
}
