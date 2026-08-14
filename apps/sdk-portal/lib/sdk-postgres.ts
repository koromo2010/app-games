import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<boolean, boolean> | null = null;
let initialized: Promise<void> | null = null;

export const SDK_SCHEMA_VERSION = 9;

function databaseUrl() {
  const url = process.env.SDK_DATABASE_URL
    ?? process.env.POSTGRES_PRISMA_URL
    ?? process.env.DATABASE_URL;
  if (!url) throw new Error("SDK PostgreSQL is not configured.");
  return url;
}

export function sdkSql() {
  if (!client) client = neon(databaseUrl());
  return client;
}

export async function ensureSdkSchema() {
  if (!initialized) {
    initialized = (async () => {
      const sql = sdkSql();
      let rows: Array<{ version: number }>;
      try {
        rows = await sql`
          SELECT COALESCE(MAX(version), 0)::INTEGER AS version
          FROM sdk_schema_migrations
        ` as Array<{ version: number }>;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "42P01") {
          throw new Error(
            `SDK_SCHEMA_MIGRATION_REQUIRED: run npm run sdk:migrate (required version ${SDK_SCHEMA_VERSION}).`,
          );
        }
        throw error;
      }
      const appliedVersion = Number(rows[0]?.version ?? 0);
      if (appliedVersion < SDK_SCHEMA_VERSION) {
        throw new Error(
          `SDK_SCHEMA_MIGRATION_REQUIRED: database is at version ${appliedVersion}; `
          + `run npm run sdk:migrate for version ${SDK_SCHEMA_VERSION}.`,
        );
      }
    })().catch((error) => {
      initialized = null;
      throw error;
    });
  }
  return initialized;
}
