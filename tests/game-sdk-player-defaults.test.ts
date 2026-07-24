import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGameSdkPlayerDefaults,
} from "../lib/game-sdk-player-defaults-store.ts";

const definitions = [
  {
    key: "timeLimitSeconds",
    label: { ja: "制限時間", en: "Time limit" },
    type: "select",
    defaultValue: 60,
    platformRole: "time-limit",
    options: [0, 30, 60],
  },
  {
    key: "rounds",
    label: { ja: "ラウンド", en: "Rounds" },
    type: "number",
    defaultValue: 3,
    minimum: 1,
    maximum: 5,
  },
] as const;

test("SDK player defaults keep only declared, valid setting values", () => {
  assert.deepEqual(normalizeGameSdkPlayerDefaults({
    timeLimitSeconds: 30,
    rounds: 99,
    hiddenSetting: "secret",
  }, definitions), {
    timeLimitSeconds: 30,
    rounds: 5,
  });
  assert.deepEqual(normalizeGameSdkPlayerDefaults({
    timeLimitSeconds: 45,
    rounds: "3",
  }, definitions), {});
});
