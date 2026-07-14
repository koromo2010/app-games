import assert from "node:assert/strict";
import test from "node:test";
import { getPostgresConfig, isPostgresConfigured } from "../lib/postgres-store.ts";

const postgresEnvironmentNames = [
  "DATABASE_URL",
  "database_DATABASE_URL",
  "database_POSTGRES_URL",
  "POSTGRES_URL",
] as const;

test("Vercel管理Neonが生成した接頭辞付きURLを検出する", () => {
  const originals = Object.fromEntries(postgresEnvironmentNames.map((name) => [name, process.env[name]]));
  try {
    for (const name of postgresEnvironmentNames) delete process.env[name];
    assert.equal(isPostgresConfigured(), false);
    process.env.database_DATABASE_URL = "postgresql://example.test/app";
    assert.deepEqual(getPostgresConfig(), {
      name: "database_DATABASE_URL",
      url: "postgresql://example.test/app",
    });
  } finally {
    for (const name of postgresEnvironmentNames) {
      const value = originals[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("標準DATABASE_URLがあれば接頭辞付きURLより優先する", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalPrefixedUrl = process.env.database_DATABASE_URL;
  try {
    process.env.DATABASE_URL = "postgresql://standard.test/app";
    process.env.database_DATABASE_URL = "postgresql://prefixed.test/app";
    assert.equal(getPostgresConfig()?.name, "DATABASE_URL");
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalPrefixedUrl === undefined) delete process.env.database_DATABASE_URL;
    else process.env.database_DATABASE_URL = originalPrefixedUrl;
  }
});
