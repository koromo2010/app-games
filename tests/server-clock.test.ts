import assert from "node:assert/strict";
import test from "node:test";
import { observeServerDate, resetServerClockForTests, synchronizedNow } from "../lib/server-clock.ts";

test("サーバー時刻を基準に端末時計のずれを補正する", () => {
  resetServerClockForTests();
  const originalNow = Date.now;
  Date.now = () => 10_000;
  try {
    observeServerDate("Thu, 01 Jan 1970 00:00:20 GMT", 9_900, 10_100);
    assert.equal(synchronizedNow(), 20_500);
  } finally {
    Date.now = originalNow;
    resetServerClockForTests();
  }
});
