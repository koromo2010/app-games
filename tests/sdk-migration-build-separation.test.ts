import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const portalPackage = JSON.parse(readFileSync(
  join(root, "apps/sdk-portal/package.json"),
  "utf8",
));
const migrationRunner = join(root, "scripts/migrate-sdk-database.mjs");

test("SDK Portal build prebuild never invokes database migration", () => {
  assert.doesNotMatch(portalPackage.scripts.prebuild, /migrate-sdk-database|--deploy/);
});

test("migration runner help is DB-free and exposes explicit targets", () => {
  const result = spawnSync(process.execPath, [migrationRunner, "--help"], {
    cwd: root,
    env: {
      NODE_ENV: "test",
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--environment development/);
  assert.match(result.stdout, /--environment production/);
  assert.doesNotMatch(result.stdout, /POSTGRES_PRISMA_URL/);
});

test("legacy implicit --deploy mode fails before any DB URL is read", () => {
  const result = spawnSync(process.execPath, [migrationRunner, "--deploy"], {
    cwd: root,
    env: {
      NODE_ENV: "test",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--deploy was removed|--environment/);
  assert.doesNotMatch(result.stderr, /PostgreSQL is not configured/);
});

test("explicit migration target without a URL fails before DB adapter loading", () => {
  const result = spawnSync(process.execPath, [migrationRunner, "--environment", "development"], {
    cwd: root,
    env: {
      NODE_ENV: "test",
      SDK_DATABASE_ENV: "development",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SDK_DATABASE_URL/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|neondatabase/);
});

test("development target rejects a production environment marker before DB access", () => {
  const result = spawnSync(process.execPath, [migrationRunner, "--environment", "development"], {
    cwd: root,
    env: {
      NODE_ENV: "test",
      SDK_DATABASE_ENV: "production",
      SDK_DATABASE_URL: "postgresql://invalid.invalid/sdk",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SDK_DATABASE_ENV must be development/);
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|ENOTFOUND|ECONN/);
});

test("migration script changes do not independently trigger Portal builds", async () => {
  const { evaluateVercelBuild } = await import("../scripts/check-vercel-build-impact.mjs");
  assert.deepEqual(evaluateVercelBuild({
    projectName: "app-games-sdk",
    branch: "main",
    changedPaths: ["scripts/migrate-sdk-database.mjs"],
  }), {
    build: false,
    reason: "surface-unaffected:portal",
  });
});
