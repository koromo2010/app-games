import assert from "node:assert/strict";
import test from "node:test";
import { hasPlayerAccountEmailOwnerConflict } from "../lib/player-account-migration.ts";

test("同じアカウントがNeonまたはRedisでメールを所有していても競合しない", () => {
  assert.equal(hasPlayerAccountEmailOwnerConflict("test1", {
    postgresLoginName: "test1",
    redisLoginName: "test1",
  }), false);
  assert.equal(hasPlayerAccountEmailOwnerConflict("test1", {
    postgresLoginName: null,
    redisLoginName: null,
  }), false);
});

test("Redisだけに残る旧アカウントのメール所有権も変更前に競合扱いする", () => {
  assert.equal(hasPlayerAccountEmailOwnerConflict("new-account", {
    postgresLoginName: null,
    redisLoginName: "legacy-account",
  }), true);
});

test("Neon上の別アカウントのメール所有権も競合扱いする", () => {
  assert.equal(hasPlayerAccountEmailOwnerConflict("new-account", {
    postgresLoginName: "other-account",
    redisLoginName: null,
  }), true);
});
