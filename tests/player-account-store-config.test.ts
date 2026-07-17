import assert from "node:assert/strict";
import test from "node:test";
import { usesStrictAppDatabase } from "../lib/player-account-environment.ts";

test("APP_DATABASE_URL使用時はRedisアカウント移行フォールバックを無効にする", () => {
  assert.equal(usesStrictAppDatabase({ APP_DATABASE_URL: "postgresql://development.example/app" }), true);
  assert.equal(usesStrictAppDatabase({ APP_DATABASE_URL: "   " }), false);
  assert.equal(usesStrictAppDatabase({}), false);
});
