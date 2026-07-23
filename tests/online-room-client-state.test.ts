import assert from "node:assert/strict";
import test from "node:test";
import { preferLatestOnlineRoom } from "../lib/online-room-client-state.ts";

test("late room responses cannot replace a newer client revision", () => {
  const current = { code: "ABCD", revision: 4, value: "new" };
  assert.equal(preferLatestOnlineRoom(current, { code: "ABCD", revision: 3, value: "old" }), current);
  assert.equal(preferLatestOnlineRoom(current, { code: "ABCD", revision: 4, value: "same" }), current);
});

test("newer and different-room responses are accepted", () => {
  const current = { code: "ABCD", revision: 4, value: "old" };
  assert.deepEqual(preferLatestOnlineRoom(current, { code: "ABCD", revision: 5, value: "new" }), { code: "ABCD", revision: 5, value: "new" });
  assert.deepEqual(preferLatestOnlineRoom(current, { code: "WXYZ", revision: 1, value: "other" }), { code: "WXYZ", revision: 1, value: "other" });
});
