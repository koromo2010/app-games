import assert from "node:assert/strict";
import test from "node:test";
import { clientTimeoutClaimDelayMs } from "../lib/game-timer/client-policy.ts";

test("ホストだけが最初に時間切れを確定し、他の端末は順番に代行する", () => {
  const options = { hostId: "host", playerIds: ["host", "p1", "p2", "p3"] };
  assert.equal(clientTimeoutClaimDelayMs({ ...options, playerId: "host" }), 0);
  assert.equal(clientTimeoutClaimDelayMs({ ...options, playerId: "p1" }), 3_500);
  assert.equal(clientTimeoutClaimDelayMs({ ...options, playerId: "p2" }), 4_250);
  assert.equal(clientTimeoutClaimDelayMs({ ...options, playerId: "p3" }), 5_000);
});

test("多数参加でも代行待機時間には上限を設ける", () => {
  const playerIds = ["host", ...Array.from({ length: 20 }, (_, index) => `p${index}`)];
  assert.equal(clientTimeoutClaimDelayMs({ hostId: "host", playerIds, playerId: "p19" }), 6_500);
});
