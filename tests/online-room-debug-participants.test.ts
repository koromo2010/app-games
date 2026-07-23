import assert from "node:assert/strict";
import test from "node:test";
import {
  nextOnlineRoomDebugParticipantName,
  removeOnlineRoomDebugParticipants,
} from "../lib/online-room-debug-participants.ts";

const players = [
  { id: "host", name: "ホスト" },
  { id: "dummy-one", name: "ダミー1", isDummy: true },
  { id: "dummy-three", name: "ダミー3", isDummy: true },
];

test("途中でダミーを削除しても次の表示名は重複しない", () => {
  assert.equal(nextOnlineRoomDebugParticipantName(players), "ダミー4");
});

test("指定したダミーだけを削除してロビー復帰状態も整理する", () => {
  const result = removeOnlineRoomDebugParticipants(players, {
    reason: "round-result",
    round: 1,
    startedAt: 1,
    returnedPlayerIds: ["host", "dummy-one", "dummy-three"],
  }, "dummy-one");

  assert.deepEqual(result.players.map((player) => player.id), ["host", "dummy-three"]);
  assert.deepEqual(result.removedPlayerIds, ["dummy-one"]);
  assert.deepEqual(result.lobbyReturn?.returnedPlayerIds, ["host", "dummy-three"]);
});

test("対象を省略すると全ダミーを一括整理する", () => {
  const result = removeOnlineRoomDebugParticipants(players, undefined);

  assert.deepEqual(result.players.map((player) => player.id), ["host"]);
  assert.deepEqual(result.removedPlayerIds, ["dummy-one", "dummy-three"]);
});
