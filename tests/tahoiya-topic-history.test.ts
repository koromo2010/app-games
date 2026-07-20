import assert from "node:assert/strict";
import test from "node:test";
import {
  getTahoiyaHistoryTopicId,
  normalizeTahoiyaHistoryWord,
  tahoiyaHistoryKeysForPlayer,
} from "../lib/tahoiya-topic-history-store.ts";

test("たほい屋の履歴IDは表記ゆれを同じ見出し語として扱う", () => {
  assert.equal(normalizeTahoiyaHistoryWord(" ＡＢＣ "), "abc");
  assert.equal(getTahoiyaHistoryTopicId(" ＡＢＣ "), getTahoiyaHistoryTopicId("abc"));
  assert.match(getTahoiyaHistoryTopicId("入市"), /^word-v1:[A-Za-z0-9_-]{43}$/);
});

test("空の見出し語は履歴IDを作らない", () => {
  assert.equal(getTahoiyaHistoryTopicId("　"), "");
});

test("アカウント削除時は通常履歴と端末補助履歴を同時に削除できる", () => {
  assert.deepEqual(tahoiyaHistoryKeysForPlayer(" player-1 "), [
    "game-history:v2:tahoiya:player-1",
    "game-history:device-bridge:v1:tahoiya:player-1",
  ]);
});
