import assert from "node:assert/strict";
import test from "node:test";
import { shouldRestartGameSdkRoomWatch } from "../app/components/game-sdk/game-sdk-room-watch-policy.ts";

test("同じRoomの更新は既存watcherを維持する", () => {
  assert.equal(shouldRestartGameSdkRoomWatch("ABCD", "ABCD", true), false);
});

test("Room変更・watcher消失・初回attachではwatcherを作り直す", () => {
  assert.equal(shouldRestartGameSdkRoomWatch("ABCD", "EFGH", true), true);
  assert.equal(shouldRestartGameSdkRoomWatch("ABCD", "ABCD", false), true);
  assert.equal(shouldRestartGameSdkRoomWatch(null, "ABCD", false), true);
});
