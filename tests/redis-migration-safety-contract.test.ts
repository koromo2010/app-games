import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/migrate-redis-namespace.mjs", "utf8");

test("Redis移行ツールは破壊的な全体操作と上書きを使わない", () => {
  for (const forbidden of ["FLUSHDB", "FLUSHALL", "RESTORE", "REPLACE", "MIGRATE"]) {
    assert.doesNotMatch(source, new RegExp(`\\b${forbidden}\\b`));
  }
  assert.match(source, /EXISTS[\s\S]+REDIS_MIGRATION_TARGET_EXISTS/);
  assert.match(source, /--confirm-no-overwrite/);
  assert.match(source, /REDIS_MIGRATION_SAME_KEY_FORBIDDEN/);
  assert.match(source, /REDIS_MIGRATION_DUPLICATE_TARGET/);
  assert.doesNotMatch(source, /raw\(source, \["DEL"/);
});

test("Redis移行ツールは全件preflight後にwriteし実行内targetだけrollbackする", () => {
  assert.match(source, /preflightCopyPlan/);
  assert.match(source, /const copyEntries = await preflightCopyPlan/);
  assert.match(source, /createdTargetKeys/);
  assert.match(source, /for \(const targetKey of createdTargetKeys\.reverse\(\)\)/);
});

test("Redis移行ツールはtype・digest・絶対TTLを移行前後で検証する", () => {
  assert.match(source, /TYPE/);
  assert.match(source, /PTTL/);
  assert.match(source, /PEXPIREAT/);
  assert.match(source, /expiresAt/);
  assert.match(source, /expiriesMatch/);
  assert.match(source, /sha256/);
  assert.match(source, /REDIS_MIGRATION_SOURCE_CHANGED/);
  assert.match(source, /REDIS_MIGRATION_SOURCE_CHANGED_DURING_COPY/);
  assert.match(source, /REDIS_MIGRATION_VERIFY_FAILED/);
});

test("Redis移行ツールは値や資格をplan・reportへ出さない", () => {
  assert.match(source, /sourceHost/);
  assert.match(source, /targetHost/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:sourceUrl|targetUrl|SOURCE_REDIS_URL|TARGET_REDIS_URL|snapshot)/);
  assert.doesNotMatch(source, /entries\.push\([^)]*snapshot/);
  assert.doesNotMatch(source, /copied\.push\([^)]*snapshot/);
});
