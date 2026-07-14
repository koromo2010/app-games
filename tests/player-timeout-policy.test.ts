import assert from "node:assert/strict";
import test from "node:test";
import { playerTimeLimitSeconds, recordPlayerActivity, recordPlayerTimeout, recoverPlayerTimeout, type PlayerTimeoutFields } from "../lib/player-timeout-policy.ts";

const initial = (): PlayerTimeoutFields => ({ playerTimeouts: { p1: { consecutiveTimeouts: 0, reducedTime: false } }, playerTimeoutNotice: null });

test("2回連続時間切れで本人だけ5秒へ短縮する", () => {
  const once = recordPlayerTimeout(initial(), "p1", "A", 100);
  assert.equal(once.playerTimeouts.p1.consecutiveTimeouts, 1);
  assert.equal(once.playerTimeoutNotice, null);
  const twice = recordPlayerTimeout(once, "p1", "A", 200);
  assert.equal(twice.playerTimeouts.p1.reducedTime, true);
  assert.equal(playerTimeLimitSeconds(60, twice.playerTimeouts, "p1"), 5);
  assert.match(twice.playerTimeoutNotice?.message ?? "", /2回連続/);
});

test("短縮前の正常入力は連続回数を戻し、短縮後は復帰操作だけが解除する", () => {
  const once = recordPlayerTimeout(initial(), "p1", "A", 100);
  assert.equal(recordPlayerActivity(once, "p1").playerTimeouts.p1.consecutiveTimeouts, 0);
  const reduced = recordPlayerTimeout(recordPlayerTimeout(initial(), "p1", "A", 100), "p1", "A", 200);
  assert.equal(recordPlayerActivity(reduced, "p1").playerTimeouts.p1.reducedTime, true);
  const recovered = recoverPlayerTimeout(reduced, "p1", "A", 300);
  assert.equal(recovered?.playerTimeouts.p1.reducedTime, false);
  assert.match(recovered?.playerTimeoutNotice?.message ?? "", /復帰/);
});
