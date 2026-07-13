import assert from "node:assert/strict";
import test from "node:test";
import { getGameTimerRetryAfterMs, isGameTimerExpired } from "../lib/game-timer/policy.ts";

const policy = { startedAt: 1_000, durationMs: 10_000, graceMs: 5_000 };

test("締切直前と受付猶予中は期限切れにしない", () => {
  assert.equal(isGameTimerExpired(policy, 10_999), false);
  assert.equal(isGameTimerExpired(policy, 14_999), false);
  assert.equal(getGameTimerRetryAfterMs(policy, 14_999), 1_001);
});

test("締切と猶予を過ぎた境界で期限切れになる", () => {
  assert.equal(isGameTimerExpired(policy, 16_000), true);
  assert.equal(getGameTimerRetryAfterMs(policy, 16_000), 0);
});
