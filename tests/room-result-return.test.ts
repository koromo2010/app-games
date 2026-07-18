import assert from "node:assert/strict";
import test from "node:test";
import { roomHasReturningPlayer, roomUpdateIsOlder, shouldHoldRoomResultTransition, shouldKeepRoomResultAfterDissolve } from "../lib/room-result-return.ts";

test("遅れて届いた古い部屋更新で復帰済み表示を巻き戻さない", () => {
  assert.equal(roomUpdateIsOlder({ code: "ABCD", revision: 12 }, { code: "ABCD", revision: 11 }), true);
  assert.equal(roomUpdateIsOlder({ code: "ABCD", revision: 12 }, { code: "ABCD", revision: 13 }), false);
  assert.equal(roomUpdateIsOlder({ code: "ABCD", revision: 12 }, { code: "WXYZ", revision: 1 }), false);
});

test("最終結果からロビーへの更新は各クライアントの復帰操作まで保留する", () => {
  assert.equal(shouldHoldRoomResultTransition({ phase: "result" }, { phase: "lobby" }, "result"), true);
  assert.equal(shouldHoldRoomResultTransition({ phase: "battle" }, { phase: "lobby" }, "result"), false);
  assert.equal(shouldHoldRoomResultTransition({ phase: "result" }, { phase: "result" }, "result"), false);
});

test("最終結果での部屋解散は表示中の結果を保持する", () => {
  assert.equal(shouldKeepRoomResultAfterDissolve({ phase: "game-result" }, "game-result"), true);
  assert.equal(shouldKeepRoomResultAfterDissolve({ phase: "lobby" }, "game-result"), false);
  assert.equal(shouldKeepRoomResultAfterDissolve(null, "game-result"), false);
});

test("満員でも既存参加者の席が残っていれば部屋へ戻れる", () => {
  const fullRoom = { players: [{ id: "host" }, { id: "guest" }] };
  assert.equal(roomHasReturningPlayer(fullRoom, "guest"), true);
  assert.equal(roomHasReturningPlayer(fullRoom, "former-player"), false);
});
