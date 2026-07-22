import assert from "node:assert/strict";
import test from "node:test";
import { getPostgresConfig, isPostgresConfigured } from "../lib/postgres-store.ts";

const postgresEnvironmentNames = [
  "APP_DATABASE_URL",
  "NEON_DATABASE_URL",
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
  const originalAppDatabaseUrl = process.env.APP_DATABASE_URL;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalPrefixedUrl = process.env.database_DATABASE_URL;
  try {
    delete process.env.APP_DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://standard.test/app";
    process.env.database_DATABASE_URL = "postgresql://prefixed.test/app";
    assert.equal(getPostgresConfig()?.name, "DATABASE_URL");
  } finally {
    if (originalAppDatabaseUrl === undefined) delete process.env.APP_DATABASE_URL;
    else process.env.APP_DATABASE_URL = originalAppDatabaseUrl;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalPrefixedUrl === undefined) delete process.env.database_DATABASE_URL;
    else process.env.database_DATABASE_URL = originalPrefixedUrl;
  }
});

test("開発Neon Integration URLを旧DATABASE_URLより優先する", () => {
  const originals = Object.fromEntries(postgresEnvironmentNames.map((name) => [name, process.env[name]]));
  try {
    delete process.env.APP_DATABASE_URL;
    process.env.NEON_DATABASE_URL = "postgresql://development.test/app";
    process.env.DATABASE_URL = "postgresql://legacy.test/app";
    assert.equal(getPostgresConfig()?.name, "NEON_DATABASE_URL");
  } finally {
    for (const name of postgresEnvironmentNames) {
      const value = originals[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("APP_DATABASE_URLを新しい正本として最優先する", () => {
  const originals = Object.fromEntries(postgresEnvironmentNames.map((name) => [name, process.env[name]]));
  try {
    process.env.APP_DATABASE_URL = "postgresql://app.test/app";
    process.env.DATABASE_URL = "postgresql://legacy.test/app";
    assert.equal(getPostgresConfig()?.name, "APP_DATABASE_URL");
  } finally {
    for (const name of postgresEnvironmentNames) {
      const value = originals[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
