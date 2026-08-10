import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("SDK migration runner accepts only the known production 005 fork", () => {
  const runner = read("scripts/migrate-sdk-database.mjs");
  const reconciliation = read("db/sdk/007_reconcile_release_decisions.sql");
  const postgres = read("apps/sdk-portal/lib/sdk-postgres.ts");

  assert.match(runner, /acceptedLegacyMigrationEntries/);
  assert.match(runner, /005_cross_environment_package_artifacts\.sql/);
  assert.match(
    runner,
    /ef3f71bcb5ef919b392aa69fdbd0577580dcb1fab16bfeaa6514225f4d7487e7/,
  );
  assert.match(runner, /!isCanonical && !isAcceptedLegacy/);
  assert.match(reconciliation, /CREATE TABLE IF NOT EXISTS sdk_release_decisions/);
  assert.match(reconciliation, /CREATE INDEX IF NOT EXISTS sdk_release_decisions_lineage_idx/);
  assert.match(postgres, /SDK_SCHEMA_VERSION = 8/);
});
