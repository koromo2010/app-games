import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeReleaseDecision,
} from "../apps/sdk-portal/lib/release-decision.ts";

test("release decisions require a bounded non-empty reason", () => {
  for (const reason of ["", "no", "x".repeat(501)]) {
    assert.equal(normalizeReleaseDecision({
      reason,
      actorRef: "admin@example.com",
    }), null);
  }
});

test("release decisions normalize the actor and preserve the review reason", () => {
  assert.deepEqual(normalizeReleaseDecision({
    reason: "  実機検証を完了したため  ",
    actorRef: " Admin@Example.COM ",
  }), {
    reason: "実機検証を完了したため",
    actorRef: "admin@example.com",
  });
  assert.equal(normalizeReleaseDecision({
    reason: "実機検証を完了したため",
    actorRef: "",
  }), null);
});
