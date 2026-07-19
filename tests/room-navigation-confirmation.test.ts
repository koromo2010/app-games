import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmResultLobbyNavigation,
  confirmRoomClose,
  confirmRoomLeave,
  resultLobbyConfirmationMessage,
  roomCloseConfirmationMessage,
  roomLeaveConfirmationMessage,
} from "../app/components/room-navigation-confirmation.ts";

test("広場への副導線は確認結果に従う", () => {
  let receivedMessage = "";
  const accepted = confirmResultLobbyNavigation((message) => {
    receivedMessage = message;
    return false;
  });

  assert.equal(accepted, false);
  assert.equal(receivedMessage, resultLobbyConfirmationMessage);
  assert.match(receivedMessage, /プレイ中の部屋/);
});

test("退出と部屋を閉じる操作は影響に応じた確認文を使う", () => {
  assert.equal(confirmRoomLeave((message) => message === roomLeaveConfirmationMessage), true);
  assert.match(roomLeaveConfirmationMessage, /参加枠から外れ/);
  assert.equal(confirmRoomClose((message) => message === roomCloseConfirmationMessage), true);
  assert.match(roomCloseConfirmationMessage, /参加者も/);
});
