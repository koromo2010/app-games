import { createHash } from "node:crypto";

export const sdkDatabaseSelectorKeys = [
  "SDK_DATABASE_URL",
  "POSTGRES_PRISMA_URL",
  "DATABASE_URL",
  "NONE",
] as const;

export type SdkDatabaseSelectorKey = (typeof sdkDatabaseSelectorKeys)[number];

export type SdkDatabaseBinding = {
  selectedKey: SdkDatabaseSelectorKey;
  fallbackUsed: boolean;
  databaseUrl?: string;
};

type SdkDatabaseDiagnosticInput = {
  binding: SdkDatabaseBinding;
  observedSchemaVersion: number;
  requiredSchemaVersion: number;
};

type SdkDatabaseBindingDiagnosticLogEvent = {
  schemaVersion: 1;
  occurredAt: string;
  level: "info";
  event: "sdk.database-binding-diagnostic";
  service: string;
  environment: "production" | "development" | "test";
  deployment?: string;
  region?: string;
  fields: ReturnType<typeof createSdkDatabaseBindingDiagnostic>;
};

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeUrlIdentity(databaseUrl: string) {
  try {
    const parsed = new URL(databaseUrl);
    const target = `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ""}`;
    const databaseName = parsed.pathname.replace(/^\/+/, "");
    return {
      databaseTargetFingerprint: fingerprint(target),
      databaseNameFingerprint: fingerprint(databaseName),
    };
  } catch {
    return {
      databaseTargetFingerprint: fingerprint("invalid-database-target"),
      databaseNameFingerprint: fingerprint("invalid-database-name"),
    };
  }
}

/** Uses the same precedence as the SDK PostgreSQL client. Never return this URL to callers. */
export function resolveSdkDatabaseBinding(
  environment: NodeJS.ProcessEnv = process.env,
): SdkDatabaseBinding {
  for (const selectedKey of sdkDatabaseSelectorKeys.slice(0, -1)) {
    const databaseUrl = environment[selectedKey];
    if (databaseUrl) {
      return {
        selectedKey,
        fallbackUsed: selectedKey !== "SDK_DATABASE_URL",
        databaseUrl,
      };
    }
  }
  return { selectedKey: "NONE", fallbackUsed: false };
}

export function createSdkDatabaseBindingDiagnostic({
  binding,
  observedSchemaVersion,
  requiredSchemaVersion,
}: SdkDatabaseDiagnosticInput) {
  return {
    databaseSelectorKey: binding.selectedKey,
    databaseFallbackUsed: binding.fallbackUsed,
    ...(binding.databaseUrl ? safeUrlIdentity(binding.databaseUrl) : {}),
    observedSchemaVersion: Math.max(0, Math.floor(observedSchemaVersion)),
    requiredSchemaVersion: Math.max(0, Math.floor(requiredSchemaVersion)),
  };
}

export function sdkDatabaseBindingOperatorDiagnosticEnabled(
  environment: NodeJS.ProcessEnv = process.env,
) {
  return environment.SDK_DATABASE_BINDING_DIAGNOSTIC === "1";
}

export function shouldEmitSdkDatabaseBindingDiagnostic({
  observedSchemaVersion,
  requiredSchemaVersion,
  operatorDiagnostic = false,
}: {
  observedSchemaVersion: number;
  requiredSchemaVersion: number;
  operatorDiagnostic?: boolean;
}) {
  return operatorDiagnostic || observedSchemaVersion < requiredSchemaVersion;
}

function sdkPortalLogEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): SdkDatabaseBindingDiagnosticLogEvent["environment"] {
  const branch = environment.VERCEL_GIT_COMMIT_REF?.trim();
  if (branch === "main" || environment.VERCEL_ENV === "production") return "production";
  if (branch === "develop" || environment.VERCEL_ENV === "preview" || environment.VERCEL_ENV === "development") {
    return "development";
  }
  return environment.NODE_ENV === "test" ? "test" : "development";
}

/**
 * This event is intentionally self-contained. The SDK Portal is deployed as
 * an isolated workspace, so a best-effort diagnostic must not pull in the
 * shared sink, its persistence path, or any unrelated service dependency.
 */
export function createSdkDatabaseBindingDiagnosticLogEvent(
  input: SdkDatabaseDiagnosticInput,
  environment: NodeJS.ProcessEnv = process.env,
): SdkDatabaseBindingDiagnosticLogEvent {
  const deployment = environment.VERCEL_GIT_COMMIT_SHA?.slice(0, 12);
  const region = environment.VERCEL_REGION?.trim();
  return {
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    level: "info",
    event: "sdk.database-binding-diagnostic",
    service: environment.OBSERVABILITY_SERVICE_NAME || "game-fields-sdk-portal",
    environment: sdkPortalLogEnvironment(environment),
    ...(deployment ? { deployment } : {}),
    ...(region ? { region } : {}),
    fields: createSdkDatabaseBindingDiagnostic(input),
  };
}

/**
 * Emits a single safe JSON line to the SDK Portal runtime log. It never uses
 * a persistence sink; source connection values remain absent from the event.
 */
export function emitSdkDatabaseBindingDiagnostic(input: SdkDatabaseDiagnosticInput) {
  console.info(JSON.stringify(createSdkDatabaseBindingDiagnosticLogEvent(input)));
}
