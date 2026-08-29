import type { SdkServiceOperationGrant } from "@game-fields/sdk-service-auth";
import {
  createSdkMigration011Database,
  executeSdkMigration011ExactlyOnce,
  SdkMigration011OperatorError,
  SdkMigration011OperationGrantReplayGuard,
  type SdkMigration011ExecutionResult,
} from "./sdk-migration-011-operator.ts";
import { sdkRuntimeSqlContext } from "./sdk-postgres.ts";
import { requireSdkMigration011OperationRequest } from "./sdk-service-auth.ts";

const responseHeaders = { "Cache-Control": "private, no-store" };
const replayGuard = new SdkMigration011OperationGrantReplayGuard();

type RuntimeContext = ReturnType<typeof sdkRuntimeSqlContext>;

export type SdkMigration011PortalRuntimeIdentity = {
  vercelEnvironment?: string;
  project?: string;
  ref?: string;
};

export type OperatorDependencies = {
  runtimeIdentity(): SdkMigration011PortalRuntimeIdentity;
  authorize(request: Request): SdkServiceOperationGrant;
  consumeGrant(grant: SdkServiceOperationGrant): void;
  runtimeContext(): RuntimeContext;
  execute(context: RuntimeContext): Promise<SdkMigration011ExecutionResult>;
};

export function isCanonicalDevelopmentSdkPortalRuntime(
  identity: SdkMigration011PortalRuntimeIdentity,
) {
  return identity.vercelEnvironment === "production"
    && identity.project === "app-games-sdk-dev"
    && identity.ref === "develop";
}

const defaultDependencies: OperatorDependencies = {
  runtimeIdentity: () => ({
    vercelEnvironment: process.env.VERCEL_ENV,
    project: process.env.VERCEL_PROJECT_NAME,
    ref: process.env.VERCEL_GIT_COMMIT_REF,
  }),
  authorize: (request) => requireSdkMigration011OperationRequest(request),
  consumeGrant: (grant) => replayGuard.consume(grant),
  runtimeContext: () => sdkRuntimeSqlContext(),
  execute: (context) => executeSdkMigration011ExactlyOnce(
    createSdkMigration011Database(context.sql),
  ),
};

function safeLog(outcome: "applied" | "already-applied" | "stopped", code: string) {
  console.info(JSON.stringify({
    schemaVersion: 1,
    event: "sdk.migration-011-operator",
    phase: "T-131-A4-v008",
    environment: "development",
    outcome,
    code,
    secretFree: true,
  }));
}

function stopped(code: string, status: number) {
  safeLog("stopped", code);
  return Response.json({
    schemaVersion: 1,
    task: "T-131-A4",
    phase: "T-131-A4-v008",
    status: "STOPPED",
    code,
    secretFree: true,
  }, { status, headers: responseHeaders });
}

export async function processSdkMigration011OperatorRequest(
  request: Request,
  dependencies: OperatorDependencies = defaultDependencies,
) {
  if (request.method !== "POST") {
    return stopped("METHOD_NOT_ALLOWED", 405);
  }
  if (!isCanonicalDevelopmentSdkPortalRuntime(dependencies.runtimeIdentity())) {
    return stopped("DEVELOPMENT_RUNTIME_REQUIRED", 403);
  }
  const url = new URL(request.url);
  if (url.search || (await request.text()).length !== 0) {
    return stopped("OPERATOR_INPUT_NOT_ALLOWED", 400);
  }

  let grant: SdkServiceOperationGrant;
  try {
    grant = dependencies.authorize(request);
  } catch {
    return stopped("SDK_OPERATION_GRANT_REQUIRED", 403);
  }

  try {
    dependencies.consumeGrant(grant);
    const context = dependencies.runtimeContext();
    if (context.selectedKey !== "SDK_DATABASE_URL" || context.fallbackUsed) {
      return stopped("SDK_DATABASE_SELECTOR_NOT_EXACT", 409);
    }
    const result = await dependencies.execute(context);
    safeLog(
      result.status === "APPLIED" ? "applied" : "already-applied",
      result.status === "APPLIED"
        ? "SDK_MIGRATION_011_APPLIED"
        : "SDK_MIGRATION_011_ALREADY_APPLIED_MATCH",
    );
    return Response.json({
      schemaVersion: 1,
      task: "T-131-A4",
      phase: "T-131-A4-v008",
      status: result.status,
      operation: "SDK_MIGRATION_011",
      operationId: grant.operationId,
      environment: "development",
      databaseSelectorKey: "SDK_DATABASE_URL",
      databaseFallbackUsed: false,
      migrationVersion: result.migrationVersion,
      observedSchemaVersion: result.schemaVersion,
      writesPerformed: result.writesPerformed,
      secretFree: true,
    }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof SdkMigration011OperatorError) {
      const conflict = error.code === "SDK_OPERATION_GRANT_REPLAY"
        || error.code === "SDK_MIGRATION_LEDGER_AHEAD"
        || error.code === "SDK_MIGRATION_LEDGER_INCONSISTENT"
        || error.code === "SDK_MIGRATION_011_OBJECT_CONTRACT_MISMATCH";
      return stopped(error.code, conflict ? 409 : 503);
    }
    return stopped("SDK_MIGRATION_011_UNAVAILABLE", 503);
  }
}
