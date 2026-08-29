import type { SdkServiceOperationGrant } from "@game-fields/sdk-service-auth";
import {
  createSdkMigration011DiagnosticDatabase,
  diagnoseSdkMigration011Ledger,
  type SdkMigration011DiagnosticResult,
} from "./sdk-migration-011-diagnostic.ts";
import {
  isAcceptedSdkMigration011DatabaseIdentity,
  isCanonicalDevelopmentSdkPortalRuntime,
  type SdkMigration011PortalRuntimeIdentity,
} from "./sdk-migration-011-operator-route.ts";
import { sdkRuntimeSqlContext } from "./sdk-postgres.ts";
import { requireSdkMigration011DiagnosticRequest } from "./sdk-service-auth.ts";

const responseHeaders = { "Cache-Control": "private, no-store" };
type RuntimeContext = ReturnType<typeof sdkRuntimeSqlContext>;

export type DiagnosticDependencies = {
  runtimeIdentity(): SdkMigration011PortalRuntimeIdentity;
  authorize(request: Request): SdkServiceOperationGrant;
  runtimeContext(): RuntimeContext;
  diagnose(context: RuntimeContext): Promise<SdkMigration011DiagnosticResult>;
};

const defaultDependencies: DiagnosticDependencies = {
  runtimeIdentity: () => ({
    vercelEnvironment: process.env.VERCEL_ENV,
    project: process.env.VERCEL_PROJECT_NAME,
    ref: process.env.VERCEL_GIT_COMMIT_REF,
  }),
  authorize: (request) => requireSdkMigration011DiagnosticRequest(request),
  runtimeContext: () => sdkRuntimeSqlContext(),
  diagnose: (context) => diagnoseSdkMigration011Ledger(
    createSdkMigration011DiagnosticDatabase(context.sql),
  ),
};

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

export async function processSdkMigration011DiagnosticRequest(
  request: Request,
  dependencies: DiagnosticDependencies = defaultDependencies,
) {
  if (request.method !== "GET") return stopped("METHOD_NOT_ALLOWED", 405);
  if (!isCanonicalDevelopmentSdkPortalRuntime(dependencies.runtimeIdentity())) {
    return stopped("DEVELOPMENT_RUNTIME_REQUIRED", 403);
  }
  const url = new URL(request.url);
  if (url.search || (await request.text()).length !== 0) {
    return stopped("DIAGNOSTIC_INPUT_NOT_ALLOWED", 400);
  }
  try {
    dependencies.authorize(request);
  } catch {
    return stopped("SDK_OPERATION_GRANT_REQUIRED", 403);
  }
  try {
    const context = dependencies.runtimeContext();
    if (!isAcceptedSdkMigration011DatabaseIdentity(context)) {
      return stopped("SDK_DATABASE_FINGERPRINT_MISMATCH", 409);
    }
    const result = await dependencies.diagnose(context);
    return Response.json({
      schemaVersion: 1,
      task: "T-131-A4",
      phase: "T-131-A4-v011",
      status: "DIAGNOSTIC_COMPLETE",
      operation: "SDK_MIGRATION_011_LEDGER_DIAGNOSTIC",
      environment: "development",
      databaseSelectorKey: context.selectedKey,
      databaseFallbackUsed: context.fallbackUsed,
      databaseTargetFingerprint: context.databaseTargetFingerprint,
      databaseNameFingerprint: context.databaseNameFingerprint,
      observedSchemaVersion: result.observedSchemaVersion,
      ledger: result.ledger,
      comparison: result.comparison,
      objectContract: result.objectContract,
      secretFree: true,
    }, { headers: responseHeaders });
  } catch {
    return stopped("SDK_MIGRATION_011_DIAGNOSTIC_UNAVAILABLE", 503);
  }
}
