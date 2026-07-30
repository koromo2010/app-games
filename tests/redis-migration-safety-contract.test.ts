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
  assert.doesNotMatch(source, /raw\(source, \["DEL"/);
});

test("Redis移行ツールはtype・digest・TTLを検証する", () => {
  assert.match(source, /TYPE/);
  assert.match(source, /PTTL/);
  assert.match(source, /PEXPIREAT/);
  assert.match(source, /sha256/);
  assert.match(source, /REDIS_MIGRATION_SOURCE_CHANGED/);
  assert.match(source, /REDIS_MIGRATION_VERIFY_FAILED/);
});

test("Redis移行ツールは値や資格をreportへ出さない", () => {
  assert.match(source, /sourceHost/);
  assert.match(source, /targetHost/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:sourceUrl|targetUrl|SOURCE_REDIS_URL|TARGET_REDIS_URL|snapshot)/);
  assert.doesNotMatch(source, /entries\.push\([^)]*snapshot/);
});
