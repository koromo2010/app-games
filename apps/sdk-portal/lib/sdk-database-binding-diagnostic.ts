import { createHash } from "node:crypto";
import { emitObservabilityEvent } from "../../../lib/observability/index.ts";

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

/**
 * Emits safe metadata to the Vercel runtime log only. `info` intentionally
 * bypasses the warn/error admin-issue persistence path.
 */
export function emitSdkDatabaseBindingDiagnostic(input: SdkDatabaseDiagnosticInput) {
  emitObservabilityEvent(
    "info",
    "sdk.database-binding-diagnostic",
    createSdkDatabaseBindingDiagnostic(input),
  );
}
