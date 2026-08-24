import type { SdkServiceOperationGrant } from "@game-fields/sdk-service-auth";
import {
  createSdkMigration010Database,
  executeSdkMigration010ExactlyOnce,
  SdkMigration010OperatorError,
  SdkOperationGrantReplayGuard,
} from "./sdk-migration-010-operator.ts";
import { sdkRuntimeSqlContext } from "./sdk-postgres.ts";
import { requireSdkMigration010OperationRequest } from "./sdk-service-auth.ts";

const responseHeaders = { "Cache-Control": "private, no-store" };
const replayGuard = new SdkOperationGrantReplayGuard();

type RuntimeContext = ReturnType<typeof sdkRuntimeSqlContext>;

type OperatorDependencies = {
  environment(): "production" | "development";
  authorize(request: Request): SdkServiceOperationGrant;
  consumeGrant(grant: SdkServiceOperationGrant): void;
  runtimeContext(): RuntimeContext;
  execute(context: RuntimeContext): Promise<{
    schemaVersion: 10;
    migrationVersion: 10;
  }>;
};

function runtimeEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): "production" | "development" {
  return environment.VERCEL_ENV === "production"
    && environment.VERCEL_GIT_COMMIT_REF === "main"
    ? "production"
    : "development";
}

const defaultDependencies: OperatorDependencies = {
  environment: () => runtimeEnvironment(),
  authorize: (request) => requireSdkMigration010OperationRequest(request),
  consumeGrant: (grant) => replayGuard.consume(grant),
  runtimeContext: () => sdkRuntimeSqlContext(),
  execute: (context) => executeSdkMigration010ExactlyOnce(
    createSdkMigration010Database(context.sql),
  ),
};

function safeLog(outcome: "applied" | "stopped", code: string) {
  console.info(JSON.stringify({
    schemaVersion: 1,
    event: "sdk.migration-010-operator",
    phase: "T-131-A1",
    outcome,
    code,
    secretFree: true,
  }));
}

function stopped(code: string, status: number) {
  safeLog("stopped", code);
  return Response.json({
    schemaVersion: 1,
    task: "T-131",
    phase: "T-131-A1",
    status: "STOPPED",
    code,
    secretFree: true,
  }, { status, headers: responseHeaders });
}

export async function processSdkMigration010OperatorRequest(
  request: Request,
  dependencies: OperatorDependencies = defaultDependencies,
) {
  if (request.method !== "POST") {
    return stopped("METHOD_NOT_ALLOWED", 405);
  }
  if (dependencies.environment() !== "production") {
    return stopped("PRODUCTION_RUNTIME_REQUIRED", 403);
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
    safeLog("applied", "SDK_MIGRATION_010_APPLIED");
    return Response.json({
      schemaVersion: 1,
      task: "T-131",
      phase: "T-131-A1",
      status: "APPLIED",
      operation: "SDK_MIGRATION_010",
      operationId: grant.operationId,
      databaseSelectorKey: "SDK_DATABASE_URL",
      databaseFallbackUsed: false,
      migrationVersion: result.migrationVersion,
      observedSchemaVersion: result.schemaVersion,
      secretFree: true,
    }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof SdkMigration010OperatorError) {
      const conflict = error.code === "SDK_OPERATION_GRANT_REPLAY"
        || error.code === "SDK_MIGRATION_010_ALREADY_APPLIED"
        || error.code === "SDK_MIGRATION_LEDGER_AHEAD"
        || error.code === "SDK_MIGRATION_LEDGER_INCONSISTENT";
      return stopped(error.code, conflict ? 409 : 503);
    }
    return stopped("SDK_MIGRATION_010_UNAVAILABLE", 503);
  }
}

export type { OperatorDependencies };
