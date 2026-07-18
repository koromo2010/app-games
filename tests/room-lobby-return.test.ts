import assert from "node:assert/strict";
import test from "node:test";
import { allRoomPlayersReturned, beginRoomLobbyReturn, canRemoveWaitingRoomPlayer, confirmRoomLobbyReturn, normalizeRoomLobbyReturnState } from "../lib/room-lobby-return.ts";

const players = [{ id: "host" }, { id: "guest" }, { id: "dummy-test" }];

test("復帰確認を始めた本人とダミー参加者は復帰済みになる", () => {
  const state = beginRoomLobbyReturn(players, "host", "debug-abort", 3, 1000);
  assert.deepEqual(state, {
    reason: "debug-abort",
    round: 3,
    startedAt: 1000,
    returnedPlayerIds: ["host", "dummy-test"],
  });
});

test("参加者の復帰確認は重複せず、部屋にいない参加者は追加しない", () => {
  const started = beginRoomLobbyReturn(players, "host", "round-result", 2, 1000);
  assert.equal(allRoomPlayersReturned(started, players), false);
  const confirmed = confirmRoomLobbyReturn(started, players, "guest");
  assert.deepEqual(confirmed?.returnedPlayerIds, ["host", "dummy-test", "guest"]);
  assert.equal(allRoomPlayersReturned(confirmed, players), true);
  assert.equal(confirmRoomLobbyReturn(confirmed, players, "guest"), confirmed);
  assert.equal(confirmRoomLobbyReturn(confirmed, players, "outsider"), confirmed);
});

test("復帰確認が始まっていない初回ロビーは開始できる", () => {
  assert.equal(allRoomPlayersReturned(undefined, players), true);
});

test("ホストは復帰待ちの参加者だけを退出対象にできる", () => {
  const started = beginRoomLobbyReturn(players, "host", "round-result", 2, 1000);
  assert.equal(canRemoveWaitingRoomPlayer(started, players, "host", "guest"), true);
  assert.equal(canRemoveWaitingRoomPlayer(started, players, "host", "host"), false);
  assert.equal(canRemoveWaitingRoomPlayer(started, players, "host", "dummy-test"), false);
  assert.equal(canRemoveWaitingRoomPlayer(undefined, players, "host", "guest"), false);
});

test("保存済み復帰状況は現在の参加者だけに正規化する", () => {
  const normalized = normalizeRoomLobbyReturnState({
    reason: "round-result",
    round: 4.8,
    startedAt: 2000,
    returnedPlayerIds: ["host", "host", "removed"],
  }, players);
  assert.deepEqual(normalized, {
    reason: "round-result",
    round: 4,
    startedAt: 2000,
    returnedPlayerIds: ["host", "dummy-test"],
  });
});
