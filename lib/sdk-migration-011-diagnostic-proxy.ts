export type SdkMigration011DiagnosticPlatformRuntimeIdentity = {
  semanticEnvironment?: string;
  vercelEnvironment?: string;
  project?: string;
  ref?: string;
};

export type SdkMigration011DiagnosticProxyDependencies = {
  requireRecentMfa(): Promise<void>;
  authorizationError(error: unknown): Response | null;
  runtimeIdentity(): SdkMigration011DiagnosticPlatformRuntimeIdentity;
  targetUrl(): string;
  operationIdentity(): { operationId: string; nonce: string };
  operationHeaders(url: string, identity: { operationId: string; nonce: string }): Record<string, string>;
  fetchTarget: typeof fetch;
};

export type SdkMigration011DiagnosticPageModel = {
  httpStatus: number;
  payload: Record<string, unknown>;
  serializedPayload: string;
};

const responseHeaders = { "Cache-Control": "private, no-store" };
const canonicalTarget = "https://sdk-dev.game-fields.com/api/internal/operations/migration-011/diagnostic";
const fallbackIdentity = {
  databaseSelectorKey: "POSTGRES_PRISMA_URL",
  databaseFallbackUsed: true,
  databaseTargetFingerprint: "43a021d13864615b4b73b65847e2e8e41a4de31cd5793fd6ab36c9acf507da0b",
  databaseNameFingerprint: "693fe5919fc229a2cf404ad99e03e8e9277fa4a6d34e88a0d4224d81b0b057a8",
} as const;
const canonicalConstraintCount = 44;

function stopped(code: string, status: number) {
  return Response.json({
    schemaVersion: 1,
    task: "T-131-A4",
    phase: "T-131-A4-v011",
    status: "STOPPED",
    code,
    secretFree: true,
  }, { status, headers: responseHeaders });
}

function stoppedPayload(code: string) {
  return {
    schemaVersion: 1,
    task: "T-131-A4",
    phase: "T-131-A4-v012",
    status: "STOPPED",
    code,
    secretFree: true,
  };
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value as object).sort();
  return actual.length === keys.length
    && [...keys].sort().every((key, index) => key === actual[index]);
}

function sha256(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function numberArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => Number.isInteger(item));
}

function validMismatch(value: unknown) {
  return exactKeys(value, ["version", "expected", "actual"])
    && Number.isInteger(value.version)
    && typeof value.expected === "string"
    && typeof value.actual === "string";
}

function validPayload(payload: unknown): payload is Record<string, unknown> {
  const topKeys = [
    "schemaVersion", "task", "phase", "status", "operation", "environment",
    "databaseSelectorKey", "databaseFallbackUsed", "databaseTargetFingerprint",
    "databaseNameFingerprint", "observedSchemaVersion", "ledger", "comparison",
    "objectContract", "secretFree",
  ];
  if (!exactKeys(payload, topKeys)) return false;
  if (
    payload.schemaVersion !== 1 || payload.task !== "T-131-A4"
    || payload.phase !== "T-131-A4-v011" || payload.status !== "DIAGNOSTIC_COMPLETE"
    || payload.operation !== "SDK_MIGRATION_011_LEDGER_DIAGNOSTIC"
    || payload.environment !== "development" || payload.secretFree !== true
    || !Number.isInteger(payload.observedSchemaVersion)
    || !sha256(payload.databaseTargetFingerprint) || !sha256(payload.databaseNameFingerprint)
  ) return false;
  const primary = payload.databaseSelectorKey === "SDK_DATABASE_URL"
    && payload.databaseFallbackUsed === false;
  const fallback = payload.databaseSelectorKey === fallbackIdentity.databaseSelectorKey
    && payload.databaseFallbackUsed === fallbackIdentity.databaseFallbackUsed
    && payload.databaseTargetFingerprint === fallbackIdentity.databaseTargetFingerprint
    && payload.databaseNameFingerprint === fallbackIdentity.databaseNameFingerprint;
  if (!primary && !fallback) return false;
  if (!Array.isArray(payload.ledger) || !payload.ledger.every((row) =>
    exactKeys(row, ["version", "name", "checksum"])
    && Number.isInteger(row.version) && typeof row.name === "string" && sha256(row.checksum))) return false;
  if (!exactKeys(payload.comparison, [
    "consistent", "acceptedLegacyVersion5", "acceptedLegacyVersion10",
    "missingVersions", "unexpectedVersions",
    "duplicateVersions", "nameMismatches", "checksumMismatches",
  ])) return false;
  const comparison = payload.comparison;
  if (typeof comparison.consistent !== "boolean"
    || typeof comparison.acceptedLegacyVersion5 !== "boolean"
    || typeof comparison.acceptedLegacyVersion10 !== "boolean"
    || !numberArray(comparison.missingVersions)
    || !numberArray(comparison.unexpectedVersions)
    || !numberArray(comparison.duplicateVersions)
    || !Array.isArray(comparison.nameMismatches)
    || !comparison.nameMismatches.every(validMismatch)
    || !Array.isArray(comparison.checksumMismatches)
    || !comparison.checksumMismatches.every(validMismatch)) return false;
  if (!exactKeys(payload.objectContract, [
    "presentObjectCount", "columnsExact", "indexesExact", "constraintCount",
    "constraintsExact", "functionExact", "state",
  ])) return false;
  const object = payload.objectContract;
  if (!(typeof object.presentObjectCount === "number"
    && Number.isInteger(object.presentObjectCount)
    && typeof object.columnsExact === "boolean"
    && typeof object.indexesExact === "boolean"
    && typeof object.constraintCount === "number"
    && Number.isInteger(object.constraintCount)
    && typeof object.constraintsExact === "boolean"
    && typeof object.functionExact === "boolean"
    && stringArray([object.state])
    && ["ABSENT", "PARTIAL", "COMPLETE"].includes(object.state as string))) return false;
  const complete = object.presentObjectCount === 7
    && object.columnsExact === true
    && object.indexesExact === true
    && object.constraintCount === canonicalConstraintCount
    && object.constraintsExact === true
    && object.functionExact === true;
  if (object.state === "COMPLETE") return complete;
  if (object.state === "ABSENT") {
    return object.presentObjectCount === 0 && object.constraintCount === 0;
  }
  return object.state === "PARTIAL" && object.presentObjectCount > 0 && !complete;
}

export function isCanonicalDevelopmentDiagnosticPlatformRuntime(
  identity: SdkMigration011DiagnosticPlatformRuntimeIdentity,
) {
  return identity.semanticEnvironment === "development"
    && identity.vercelEnvironment === "production"
    && identity.project === "app-games-dev"
    && identity.ref === "develop";
}

async function authorizeSdkMigration011Diagnostic(
  dependencies: SdkMigration011DiagnosticProxyDependencies,
) {
  try {
    await dependencies.requireRecentMfa();
  } catch (error) {
    return dependencies.authorizationError(error) ?? stopped("SITE_ADMIN_STEP_UP_REQUIRED", 403);
  }
  if (!isCanonicalDevelopmentDiagnosticPlatformRuntime(dependencies.runtimeIdentity())) {
    return stopped("DEVELOPMENT_RUNTIME_REQUIRED", 403);
  }
  return null;
}

async function dispatchSdkMigration011Diagnostic(
  dependencies: SdkMigration011DiagnosticProxyDependencies,
) {
  const target = dependencies.targetUrl();
  if (target !== canonicalTarget) return stopped("DEVELOPMENT_RUNTIME_REQUIRED", 403);
  const identity = dependencies.operationIdentity();
  try {
    const response = await dependencies.fetchTarget(target, {
      method: "GET",
      headers: dependencies.operationHeaders(target, identity),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return stopped("SDK_MIGRATION_011_DIAGNOSTIC_UNAVAILABLE", 503);
    if (!validPayload(payload)) return stopped("SDK_MIGRATION_011_DIAGNOSTIC_INVALID_RESPONSE", 502);
    return Response.json(payload, { headers: responseHeaders });
  } catch {
    return stopped("SDK_MIGRATION_011_DIAGNOSTIC_UNAVAILABLE", 503);
  }
}

export async function renderSdkMigration011Diagnostic(
  dependencies: SdkMigration011DiagnosticProxyDependencies,
) {
  const authorizationFailure = await authorizeSdkMigration011Diagnostic(dependencies);
  if (authorizationFailure) return authorizationFailure;
  return dispatchSdkMigration011Diagnostic(dependencies);
}

export async function loadSdkMigration011DiagnosticPageModel(
  dependencies: SdkMigration011DiagnosticProxyDependencies,
): Promise<SdkMigration011DiagnosticPageModel> {
  const response = await renderSdkMigration011Diagnostic(dependencies);
  const responsePayload = await response.json().catch(() => null);
  const payload = response.ok && validPayload(responsePayload)
    ? responsePayload
    : stoppedPayload(
      response.status === 401
        ? "SITE_ADMIN_AUTH_REQUIRED"
        : response.status === 403
          ? "SITE_ADMIN_STEP_UP_OR_DEVELOPMENT_RUNTIME_REQUIRED"
          : "SDK_MIGRATION_011_DIAGNOSTIC_UNAVAILABLE",
    );
  return {
    httpStatus: response.status,
    payload,
    serializedPayload: JSON.stringify(payload, null, 2),
  };
}

export async function proxySdkMigration011Diagnostic(
  request: Request,
  dependencies: SdkMigration011DiagnosticProxyDependencies,
) {
  if (request.method !== "GET") return stopped("METHOD_NOT_ALLOWED", 405);
  const authorizationFailure = await authorizeSdkMigration011Diagnostic(dependencies);
  if (authorizationFailure) return authorizationFailure;
  const incoming = new URL(request.url);
  if (incoming.search || (await request.text()).length !== 0) {
    return stopped("DIAGNOSTIC_INPUT_NOT_ALLOWED", 400);
  }
  return dispatchSdkMigration011Diagnostic(dependencies);
}
