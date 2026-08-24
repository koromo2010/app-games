export type SdkMigration010ProxyDependencies = {
  requireRecentMfa(): Promise<void>;
  authorizationError(error: unknown): Response | null;
  environment(): "production" | "development";
  targetUrl(): string;
  operationIdentity(): { operationId: string; nonce: string };
  operationHeaders(
    url: string,
    identity: { operationId: string; nonce: string },
  ): Record<string, string>;
  fetchTarget: typeof fetch;
};

const responseHeaders = { "Cache-Control": "private, no-store" };
const upstreamStopCodes = new Set([
  "SDK_OPERATION_GRANT_REQUIRED",
  "SDK_OPERATION_GRANT_REPLAY",
  "PRODUCTION_RUNTIME_REQUIRED",
  "SDK_DATABASE_SELECTOR_NOT_EXACT",
  "SDK_MIGRATION_010_ALREADY_APPLIED",
  "SDK_MIGRATION_LEDGER_AHEAD",
  "SDK_MIGRATION_LEDGER_INCONSISTENT",
  "SDK_MIGRATION_010_TRANSACTION_FAILED",
  "SDK_MIGRATION_010_POST_COMMIT_READBACK_FAILED",
  "SDK_MIGRATION_010_UNAVAILABLE",
]);

function stopped(code: string, status: number) {
  return Response.json({
    schemaVersion: 1,
    task: "T-131",
    phase: "T-131-A1",
    status: "STOPPED",
    code,
    secretFree: true,
  }, { status, headers: responseHeaders });
}

export async function proxySdkMigration010Operator(
  request: Request,
  dependencies: SdkMigration010ProxyDependencies,
) {
  if (request.method !== "POST") return stopped("METHOD_NOT_ALLOWED", 405);
  try {
    await dependencies.requireRecentMfa();
  } catch (error) {
    return dependencies.authorizationError(error)
      ?? stopped("SITE_ADMIN_STEP_UP_REQUIRED", 403);
  }
  if (dependencies.environment() !== "production") {
    return stopped("PRODUCTION_RUNTIME_REQUIRED", 403);
  }
  const incoming = new URL(request.url);
  if (incoming.search || (await request.text()).length !== 0) {
    return stopped("OPERATOR_INPUT_NOT_ALLOWED", 400);
  }

  const identity = dependencies.operationIdentity();
  const target = dependencies.targetUrl();
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
        : "SDK_MIGRATION_010_UNAVAILABLE";
      return stopped(code, response.status >= 400 && response.status < 600
        ? response.status
        : 503);
    }
    if (
      payload?.status !== "APPLIED"
      || payload.phase !== "T-131-A1"
      || payload.operation !== "SDK_MIGRATION_010"
      || payload.operationId !== identity.operationId
      || payload.databaseSelectorKey !== "SDK_DATABASE_URL"
      || payload.databaseFallbackUsed !== false
      || payload.migrationVersion !== 10
      || payload.observedSchemaVersion !== 10
      || payload.secretFree !== true
    ) {
      return stopped("SDK_MIGRATION_010_INVALID_RESPONSE", 502);
    }
    return Response.json({
      schemaVersion: 1,
      task: "T-131",
      phase: "T-131-A1",
      status: "APPLIED",
      operation: "SDK_MIGRATION_010",
      operationId: identity.operationId,
      databaseSelectorKey: "SDK_DATABASE_URL",
      databaseFallbackUsed: false,
      migrationVersion: 10,
      observedSchemaVersion: 10,
      secretFree: true,
    }, { headers: responseHeaders });
  } catch {
    return stopped("SDK_MIGRATION_010_UNAVAILABLE", 503);
  }
}
