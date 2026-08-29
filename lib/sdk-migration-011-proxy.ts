export type SdkMigration011PlatformRuntimeIdentity = {
  semanticEnvironment?: string;
  vercelEnvironment?: string;
  project?: string;
  ref?: string;
};

export type SdkMigration011ProxyDependencies = {
  requireRecentMfa(): Promise<void>;
  authorizationError(error: unknown): Response | null;
  runtimeIdentity(): SdkMigration011PlatformRuntimeIdentity;
  targetUrl(): string;
  operationIdentity(): { operationId: string; nonce: string };
  operationHeaders(
    url: string,
    identity: { operationId: string; nonce: string },
  ): Record<string, string>;
  fetchTarget: typeof fetch;
};

const responseHeaders = { "Cache-Control": "private, no-store" };
const canonicalPortalOrigin = "https://sdk-dev.game-fields.com";
const canonicalPortalPath = "/api/internal/operations/migration-011";
const developmentFallbackIdentity = {
  databaseSelectorKey: "POSTGRES_PRISMA_URL",
  databaseFallbackUsed: true,
  databaseTargetFingerprint: "43a021d13864615b4b73b65847e2e8e41a4de31cd5793fd6ab36c9acf507da0b",
  databaseNameFingerprint: "693fe5919fc229a2cf404ad99e03e8e9277fa4a6d34e88a0d4224d81b0b057a8",
} as const;
const upstreamStopCodes = new Set([
  "SDK_OPERATION_GRANT_REQUIRED",
  "SDK_OPERATION_GRANT_REPLAY",
  "DEVELOPMENT_RUNTIME_REQUIRED",
  "SDK_DATABASE_SELECTOR_NOT_EXACT",
  "SDK_DATABASE_FINGERPRINT_MISMATCH",
  "SDK_MIGRATION_LEDGER_AHEAD",
  "SDK_MIGRATION_LEDGER_INCONSISTENT",
  "SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH",
  "SDK_MIGRATION_011_TRANSACTION_FAILED",
  "SDK_MIGRATION_011_POST_COMMIT_READBACK_FAILED",
  "SDK_MIGRATION_011_UNAVAILABLE",
]);

function isSha256Fingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isAcceptedDatabaseIdentity(payload: Record<string, unknown>) {
  if (
    !isSha256Fingerprint(payload.databaseTargetFingerprint)
    || !isSha256Fingerprint(payload.databaseNameFingerprint)
  ) return false;
  if (
    payload.databaseSelectorKey === "SDK_DATABASE_URL"
    && payload.databaseFallbackUsed === false
  ) return true;
  return payload.databaseSelectorKey === developmentFallbackIdentity.databaseSelectorKey
    && payload.databaseFallbackUsed === developmentFallbackIdentity.databaseFallbackUsed
    && payload.databaseTargetFingerprint === developmentFallbackIdentity.databaseTargetFingerprint
    && payload.databaseNameFingerprint === developmentFallbackIdentity.databaseNameFingerprint;
}

function stopped(code: string, status: number) {
  return Response.json({
    schemaVersion: 1,
    task: "T-131-A4",
    phase: "T-131-A4-v008",
    status: "STOPPED",
    code,
    secretFree: true,
  }, { status, headers: responseHeaders });
}

export function isCanonicalDevelopmentPlatformRuntime(
  identity: SdkMigration011PlatformRuntimeIdentity,
) {
  return identity.semanticEnvironment === "development"
    && identity.vercelEnvironment === "production"
    && identity.project === "app-games-dev"
    && identity.ref === "develop";
}

export function isCanonicalDevelopmentMigration011Target(target: string) {
  try {
    const url = new URL(target);
    return url.origin === canonicalPortalOrigin
      && url.pathname === canonicalPortalPath
      && url.search === ""
      && url.hash === ""
      && url.username === ""
      && url.password === "";
  } catch {
    return false;
  }
}

export async function proxySdkMigration011Operator(
  request: Request,
  dependencies: SdkMigration011ProxyDependencies,
) {
  if (request.method !== "POST") return stopped("METHOD_NOT_ALLOWED", 405);
  try {
    await dependencies.requireRecentMfa();
  } catch (error) {
    return dependencies.authorizationError(error)
      ?? stopped("SITE_ADMIN_STEP_UP_REQUIRED", 403);
  }
  if (!isCanonicalDevelopmentPlatformRuntime(dependencies.runtimeIdentity())) {
    return stopped("DEVELOPMENT_RUNTIME_REQUIRED", 403);
  }
  const incoming = new URL(request.url);
  if (incoming.search || (await request.text()).length !== 0) {
    return stopped("OPERATOR_INPUT_NOT_ALLOWED", 400);
  }

  const target = dependencies.targetUrl();
  if (!isCanonicalDevelopmentMigration011Target(target)) {
    return stopped("DEVELOPMENT_RUNTIME_REQUIRED", 403);
  }
  const identity = dependencies.operationIdentity();
  try {
    const response = await dependencies.fetchTarget(target, {
      method: "POST",
      headers: dependencies.operationHeaders(target, identity),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      const code = typeof payload?.code === "string"
        && upstreamStopCodes.has(payload.code)
        ? payload.code
        : "SDK_MIGRATION_011_UNAVAILABLE";
      return stopped(code, response.status >= 400 && response.status < 600
        ? response.status
        : 503);
    }
    const status = payload?.status;
    const expectedWrites = status === "APPLIED"
      ? 1
      : status === "ALREADY_APPLIED_MATCH"
        ? 0
        : null;
    if (
      expectedWrites === null
      || payload?.phase !== "T-131-A4-v008"
      || payload.operation !== "SDK_MIGRATION_011"
      || payload.operationId !== identity.operationId
      || payload.environment !== "development"
      || !isAcceptedDatabaseIdentity(payload)
      || payload.migrationVersion !== 11
      || payload.observedSchemaVersion !== 11
      || payload.writesPerformed !== expectedWrites
      || payload.secretFree !== true
    ) {
      return stopped("SDK_MIGRATION_011_INVALID_RESPONSE", 502);
    }
    return Response.json({
      schemaVersion: 1,
      task: "T-131-A4",
      phase: "T-131-A4-v008",
      status,
      operation: "SDK_MIGRATION_011",
      operationId: identity.operationId,
      environment: "development",
      databaseSelectorKey: payload.databaseSelectorKey,
      databaseFallbackUsed: payload.databaseFallbackUsed,
      databaseTargetFingerprint: payload.databaseTargetFingerprint,
      databaseNameFingerprint: payload.databaseNameFingerprint,
      migrationVersion: 11,
      observedSchemaVersion: 11,
      writesPerformed: expectedWrites,
      secretFree: true,
    }, { headers: responseHeaders });
  } catch {
    return stopped("SDK_MIGRATION_011_UNAVAILABLE", 503);
  }
}
