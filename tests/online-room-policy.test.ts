import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOnlineRoomCode, onlineRoomListPageSize, onlineRoomPassphraseMaximumLength, onlineRoomPlayerLimits } from "../lib/online-room-policy.ts";

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

test("部屋一覧は1回あたり24件に制限する", () => {
  assert.equal(onlineRoomListPageSize, 24);
});

test("全オンラインゲームに参加人数の安全上限を持たせる", () => {
  assert.deepEqual(onlineRoomPlayerLimits, {
    wordwolf: 20,
    tahoiya: 8,
    northernBranch: 4,
    hodoai: 50,
    kotobaSenpuku: 20,
    nigoichi: 6,
  });
});
