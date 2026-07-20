import assert from "node:assert/strict";
import test from "node:test";
import { onlineRoomPollingDelay, onlineRoomPollingIntervals } from "../app/hooks/use-online-room-polling.ts";

test("部屋の状態別にRedis負荷を抑えたポーリング間隔を使う", () => {
  assert.deepEqual(onlineRoomPollingIntervals, {
    realtime: 1_000,
    active: 2_000,
    idle: 5_000,
  });
});

test("部屋読み取り失敗時のポーリング間隔を段階的に延ばす", () => {
  assert.equal(onlineRoomPollingDelay(1_000, 0), 1_000);
  assert.equal(onlineRoomPollingDelay(1_000, 1), 2_000);
  assert.equal(onlineRoomPollingDelay(1_000, 4), 16_000);
  assert.equal(onlineRoomPollingDelay(1_000, 20), 30_000);
});
