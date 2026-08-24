import assert from "node:assert/strict";
import test from "node:test";
import { preferLatestOnlineRoom } from "../lib/online-room-client-state.ts";

test("late room responses cannot replace a newer client revision", () => {
  const current = { code: "ABCD", revision: 4, value: "new" };
  assert.equal(preferLatestOnlineRoom(current, { code: "ABCD", revision: 3, value: "old" }), current);
  assert.equal(preferLatestOnlineRoom(current, { code: "ABCD", revision: 4, value: "same" }), current);
});

test("newer same-Room responses are accepted while a stale different-Room response is isolated", () => {
  const current = { code: "ABCD", revision: 4, value: "old" };
  assert.deepEqual(preferLatestOnlineRoom(current, { code: "ABCD", revision: 5, value: "new" }), { code: "ABCD", revision: 5, value: "new" });
  assert.equal(preferLatestOnlineRoom(current, { code: "WXYZ", revision: 1, value: "other" }), current);
});
