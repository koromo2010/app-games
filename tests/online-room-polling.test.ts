import assert from "node:assert/strict";
import test from "node:test";
import {
  onlineRoomFallbackInterval,
  onlineRoomPollingDelay,
  onlineRoomPollingIntervals,
  onlineRoomPollingJitter,
} from "../app/hooks/online-room-polling-policy.ts";

test("部屋の状態別にRedis負荷を抑えたポーリング間隔を使う", () => {
  assert.deepEqual(onlineRoomPollingIntervals, {
    realtime: 1_000,
    active: 3_000,
    idle: 5_000,
  });
});

test("同時アクセスの山を避けるためポーリングを小さく分散する", () => {
  assert.equal(onlineRoomPollingJitter(3_000, 0), 2_700);
  assert.equal(onlineRoomPollingJitter(3_000, 0.5), 3_000);
  assert.equal(onlineRoomPollingJitter(3_000, 1), 3_300);
});

test("部屋読み取り失敗時のポーリング間隔を段階的に延ばす", () => {
  assert.equal(onlineRoomPollingDelay(1_000, 0), 1_000);
  assert.equal(onlineRoomPollingDelay(1_000, 1), 2_000);
  assert.equal(onlineRoomPollingDelay(1_000, 4), 16_000);
  assert.equal(onlineRoomPollingDelay(1_000, 20), 30_000);
});

test("WebSocket再接続中は最大2秒、明示的な無効環境では通常間隔を使う", () => {
  assert.equal(onlineRoomFallbackInterval(1_000, false), 1_000);
  assert.equal(onlineRoomFallbackInterval(3_000, false), 2_000);
  assert.equal(onlineRoomFallbackInterval(5_000, false), 2_000);
  assert.equal(onlineRoomFallbackInterval(3_000, true), 3_000);
  assert.equal(onlineRoomFallbackInterval(5_000, true), 5_000);
});
