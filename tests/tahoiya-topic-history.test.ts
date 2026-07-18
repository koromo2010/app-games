import assert from "node:assert/strict";
import test from "node:test";
import {
  getTahoiyaHistoryTopicId,
  normalizeTahoiyaHistoryWord,
} from "../lib/tahoiya-topic-history-store.ts";

test("たほい屋の履歴IDは表記ゆれを同じ見出し語として扱う", () => {
  assert.equal(normalizeTahoiyaHistoryWord(" ＡＢＣ "), "abc");
  assert.equal(getTahoiyaHistoryTopicId(" ＡＢＣ "), getTahoiyaHistoryTopicId("abc"));
  assert.match(getTahoiyaHistoryTopicId("入市"), /^word-v1:[A-Za-z0-9_-]{43}$/);
});

test("空の見出し語は履歴IDを作らない", () => {
  assert.equal(getTahoiyaHistoryTopicId("　"), "");
});
