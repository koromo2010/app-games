import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import {
  emitSdkDatabaseBindingDiagnostic,
  resolveSdkDatabaseBinding,
  sdkDatabaseBindingOperatorDiagnosticEnabled,
  shouldEmitSdkDatabaseBindingDiagnostic,
  type SdkDatabaseBinding,
} from "./sdk-database-binding-diagnostic.ts";

let client: NeonQueryFunction<boolean, boolean> | null = null;
let clientBinding: SdkDatabaseBinding | null = null;
let initialized: Promise<void> | null = null;

export const SDK_SCHEMA_VERSION = 11;

function configuredDatabaseUrl(binding: SdkDatabaseBinding) {
  if (!binding.databaseUrl) throw new Error("SDK PostgreSQL is not configured.");
  return binding.databaseUrl;
}

function sdkSqlForBinding(binding: SdkDatabaseBinding) {
  if (!client) {
    client = neon(configuredDatabaseUrl(binding));
    clientBinding = binding;
  }
  return { sql: client, binding: clientBinding ?? binding };
}

/**
 * Returns the module-scoped SQL client used by health and all SDK stores,
 * together with selector metadata only. The configured URL never leaves this
 * module boundary.
 */
export function sdkRuntimeSqlContext() {
  const { sql, binding } = sdkSqlForBinding(resolveSdkDatabaseBinding());
  return {
    sql,
    selectedKey: binding.selectedKey,
    fallbackUsed: binding.fallbackUsed,
  };
}

export function sdkSql() {
  return sdkRuntimeSqlContext().sql;
}

export async function ensureSdkSchema() {
  if (!initialized) {
    initialized = (async () => {
      const requestedBinding = resolveSdkDatabaseBinding();
      if (!requestedBinding.databaseUrl) {
        if (shouldEmitSdkDatabaseBindingDiagnostic({
          observedSchemaVersion: 0,
          requiredSchemaVersion: SDK_SCHEMA_VERSION,
        })) {
          emitSdkDatabaseBindingDiagnostic({
            binding: requestedBinding,
            observedSchemaVersion: 0,
            requiredSchemaVersion: SDK_SCHEMA_VERSION,
          });
        }
        throw new Error("SDK PostgreSQL is not configured.");
      }
      const { sql, binding } = sdkSqlForBinding(requestedBinding);
      let rows: Array<{ version: number }>;
      try {
        rows = await sql`
          SELECT COALESCE(MAX(version), 0)::INTEGER AS version
          FROM sdk_schema_migrations
        ` as Array<{ version: number }>;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "42P01") {
          if (shouldEmitSdkDatabaseBindingDiagnostic({
            observedSchemaVersion: 0,
            requiredSchemaVersion: SDK_SCHEMA_VERSION,
          })) {
            emitSdkDatabaseBindingDiagnostic({
              binding,
              observedSchemaVersion: 0,
              requiredSchemaVersion: SDK_SCHEMA_VERSION,
            });
          }
          throw new Error(
            `SDK_SCHEMA_MIGRATION_REQUIRED: run npm run sdk:migrate (required version ${SDK_SCHEMA_VERSION}).`,
          );
        }
        throw error;
      }
      const appliedVersion = Number(rows[0]?.version ?? 0);
      if (appliedVersion < SDK_SCHEMA_VERSION) {
        if (shouldEmitSdkDatabaseBindingDiagnostic({
          observedSchemaVersion: appliedVersion,
          requiredSchemaVersion: SDK_SCHEMA_VERSION,
        })) {
          emitSdkDatabaseBindingDiagnostic({
            binding,
            observedSchemaVersion: appliedVersion,
            requiredSchemaVersion: SDK_SCHEMA_VERSION,
          });
        }
        throw new Error(
          `SDK_SCHEMA_MIGRATION_REQUIRED: database is at version ${appliedVersion}; `
          + `run npm run sdk:migrate for version ${SDK_SCHEMA_VERSION}.`,
        );
      }
      if (shouldEmitSdkDatabaseBindingDiagnostic({
        observedSchemaVersion: appliedVersion,
        requiredSchemaVersion: SDK_SCHEMA_VERSION,
        operatorDiagnostic: sdkDatabaseBindingOperatorDiagnosticEnabled(),
      })) {
        emitSdkDatabaseBindingDiagnostic({
          binding,
          observedSchemaVersion: appliedVersion,
          requiredSchemaVersion: SDK_SCHEMA_VERSION,
        });
      }
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}
