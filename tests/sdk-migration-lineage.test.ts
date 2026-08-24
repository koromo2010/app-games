import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  acceptedLegacyMigrationEntries,
  migrationChecksum,
  normalizeMigrationSource,
  verifyAppliedChecksums,
} from "../scripts/migrate-sdk-database.mjs";
import { originalDataPreservationSchema9AcceptedLegacyEntries } from "../apps/sdk-portal/lib/original-data-preservation.ts";
import {
  sdkMigration010Checksum,
  sdkMigration010Source,
} from "../apps/sdk-portal/lib/sdk-migration-010-operator.ts";

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
  assert.match(postgres, /SDK_SCHEMA_VERSION = 10/);
  assert.match(read("db/sdk/009_module_profile_proposals.sql"), /sdk_game_module_profile_proposals/);
  assert.match(read("db/sdk/010_bounded_creator_quarantine_recovery.sql"), /sdk_creator_recovery_operations/);
});

test("A0 schema-9 rescue lineage stays byte-identical to the migration runner contract", () => {
  const runnerEntries = [...acceptedLegacyMigrationEntries.entries()]
    .flatMap(([version, entries]) => [...entries.entries()]
      .map(([name, checksum]) => ({ version, name, checksum })));

  assert.deepEqual(runnerEntries, originalDataPreservationSchema9AcceptedLegacyEntries);
  assert.doesNotThrow(() => verifyAppliedChecksums(runnerEntries));
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

test("migration 010 source and checksum stay canonical at schema version 10", () => {
  const migration010 = normalizeMigrationSource(
    read("db/sdk/010_bounded_creator_quarantine_recovery.sql"),
  );
  const postgres = read("apps/sdk-portal/lib/sdk-postgres.ts");
  assert.equal(sdkMigration010Source, migration010);
  assert.equal(migrationChecksum(migration010), sdkMigration010Checksum);
  assert.match(postgres, /SDK_SCHEMA_VERSION = 10/);
  assert.equal(existsSync("db/sdk/011_bounded_creator_quarantine_recovery.sql"), false);
});

test("migration 010 is target-neutral, live-counted schema-only quarantine infrastructure", () => {
  const migration010 = read("db/sdk/010_bounded_creator_quarantine_recovery.sql");
  assert.doesNotMatch(migration010, /moi-lab2|yabobojpn-lab/);
  assert.doesNotMatch(
    migration010,
    /(?:game_count|package_revision_count|artifact_locator_count|release_count)\s*=\s*[0-9]+/,
  );
  for (const count of [
    "game_count",
    "package_revision_count",
    "artifact_locator_count",
    "release_count",
  ]) {
    assert.match(migration010, new RegExp(`${count} >= 0`));
  }
  assert.match(migration010, /operation_id UUID PRIMARY KEY/);
  assert.match(migration010, /operation_nonce UUID NOT NULL UNIQUE/);
  assert.match(migration010, /target_key VARCHAR\(64\) NOT NULL/);
  assert.match(migration010, /plan_receipt CHAR\(64\) NOT NULL/);
  assert.match(migration010, /terminal_receipt CHAR\(64\),/);
  assert.match(migration010, /state IN \('pending', 'completed'\)/);
  assert.match(migration010, /created_at TIMESTAMPTZ/);
  assert.match(migration010, /updated_at TIMESTAMPTZ/);
  assert.match(migration010, /completed_at TIMESTAMPTZ/);
  assert.match(migration010, /visibility = 'non-public'/);
  assert.match(migration010, /owner_binding_state = 'unbound'/);
  assert.match(migration010, /grant_state = 'blocked'/);
  assert.match(migration010, /release_state = 'blocked'/);
  assert.match(migration010, /publication_state = 'blocked'/);
  assert.doesNotMatch(migration010, /\bINSERT\s+INTO\b|\bUPDATE\b|\bDELETE\s+FROM\b/i);
});
