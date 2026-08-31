import assert from "node:assert/strict";
import test from "node:test";
import {
  observeServerDate,
  resetServerClockForTests,
  subscribeServerClock,
  synchronizedNow,
} from "../lib/server-clock.ts";

test("ahead/behind端末時計のどちらでも同じserver epochへ補正する", () => {
  resetServerClockForTests();
  observeServerDate(
    "Thu, 01 Jan 1970 00:00:20 GMT",
    99_900,
    100_100,
    1_000,
  );
  const ahead = synchronizedNow(900_000, 1_500);
  resetServerClockForTests();
  observeServerDate(
    "Thu, 01 Jan 1970 00:00:20 GMT",
    900,
    1_100,
    1_000,
  );
  const behind = synchronizedNow(-500_000, 1_500);
  assert.equal(ahead, 21_100);
  assert.equal(behind, ahead);
  resetServerClockForTests();
});

test("観測後のwall-clock jumpを単調時間で遮断する", () => {
  resetServerClockForTests();
  observeServerDate(
    "Thu, 01 Jan 1970 00:00:20 GMT",
    9_900,
    10_100,
    200,
  );
  assert.equal(synchronizedNow(10_100, 700), 21_100);
  assert.equal(synchronizedNow(9_000_000, 700), 21_100);
  assert.equal(synchronizedNow(-9_000_000, 700), 21_100);
  resetServerClockForTests();
});

test("missing/invalid/out-of-order server sampleを採用しない", () => {
  resetServerClockForTests();
  let observations = 0;
  const unsubscribe = subscribeServerClock(() => { observations += 1; });
  assert.equal(observeServerDate(null, 0, 0, 0), false);
  assert.equal(observeServerDate("invalid", 0, 0, 0), false);
  assert.equal(observeServerDate(
    "Thu, 01 Jan 1970 00:00:20 GMT",
    9_900,
    10_100,
    200,
  ), true);
  assert.equal(observeServerDate(
    "Thu, 01 Jan 1970 00:00:30 GMT",
    10_000,
    10_200,
    100,
  ), false);
  assert.equal(observeServerDate(
    "Thu, 01 Jan 1970 00:00:05 GMT",
    10_200,
    10_300,
    300,
  ), false);
  assert.equal(observations, 1);
  unsubscribe();
  resetServerClockForTests();
});
