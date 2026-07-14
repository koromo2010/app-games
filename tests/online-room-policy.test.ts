import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOnlineRoomCode, onlineRoomPassphraseMaximumLength } from "../lib/online-room-policy.ts";

test("オンライン部屋番号は4文字の英数字だけを受け付ける", () => {
  assert.equal(normalizeOnlineRoomCode(" ab12 "), "AB12");
  assert.equal(normalizeOnlineRoomCode("ABC"), "");
  assert.equal(normalizeOnlineRoomCode("ABCDE"), "");
  assert.equal(normalizeOnlineRoomCode("あいうえ"), "");
  assert.equal(normalizeOnlineRoomCode("../../"), "");
});

test("合言葉の技術上限は共通で40文字", () => {
  assert.equal(onlineRoomPassphraseMaximumLength, 40);
});
