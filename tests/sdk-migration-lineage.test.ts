import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  migrationChecksum,
  normalizeMigrationSource,
  verifyAppliedChecksums,
} from "../scripts/migrate-sdk-database.mjs";

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
  assert.match(postgres, /SDK_SCHEMA_VERSION = 9/);
  assert.match(read("db/sdk/009_module_profile_proposals.sql"), /sdk_game_module_profile_proposals/);
});

test("SDK migration checksums are independent of checkout line endings", () => {
  const lfSql = "CREATE TABLE example (\n  id INTEGER PRIMARY KEY\n);\n";
  const lfHook = "async function backfill(sql) {\n  await sql`SELECT 1`;\n}";
  const crlfSql = lfSql.replaceAll("\n", "\r\n");
  const crlfHook = lfHook.replaceAll("\n", "\r\n");

  const rawLfChecksum = createHash("sha256")
    .update(lfSql)
    .update("\0")
    .update(lfHook)
    .digest("hex");
  const rawCrlfChecksum = createHash("sha256")
    .update(crlfSql)
    .update("\0")
    .update(crlfHook)
    .digest("hex");

  assert.notEqual(rawLfChecksum, rawCrlfChecksum);
  assert.equal(normalizeMigrationSource(crlfSql), lfSql);
  assert.equal(normalizeMigrationSource(crlfHook), lfHook);
  assert.equal(
    migrationChecksum(lfSql, lfHook),
    migrationChecksum(crlfSql, crlfHook),
  );
  assert.equal(migrationChecksum(lfSql, lfHook), rawLfChecksum);
});

test("line-ending normalization preserves existing canonical ledger checksums", () => {
  verifyAppliedChecksums([
    {
      version: 1,
      name: "001_sdk_registry.sql",
      checksum: "5456100f4e2bf5cbba4cdf64bc883699ce0a89971e293c08a353803a1e965117",
    },
    {
      version: 3,
      name: "003_immutable_packages_and_lifecycle.sql",
      checksum: "60c88555bb042c28f5196d7c916ac222fb2ab37ef4294e64b32e5d4ddd2507c5",
    },
    {
      version: 8,
      name: "008_mock_approval_and_authoring_gate.sql",
      checksum: "e8b31e6debda55d6a70977a5d9c96aa97403983821d52b1ebcd8d1b32b608894",
    },
  ]);
});
