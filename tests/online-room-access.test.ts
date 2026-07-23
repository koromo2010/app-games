import assert from "node:assert/strict";
import test from "node:test";
import {
  canLeaveOnlineRoomLobby,
  canRemoveOnlineRoomDebugPlayer,
  isOnlineRoomDebugPlayer,
  onlineRoomActorAccess,
} from "../lib/online-room-access.ts";

test("参加者とホストの部屋権限を同じ基準で判定する", () => {
  const players = [{ id: "host" }, { id: "member" }, { id: "dummy", isDummy: true }];
  assert.deepEqual(onlineRoomActorAccess("host", players, "host"), { isHost: true, isMember: true });
  assert.deepEqual(onlineRoomActorAccess("host", players, "member"), { isHost: false, isMember: true });
  assert.deepEqual(onlineRoomActorAccess("host", players, "dummy", { excludeDummy: true }), { isHost: false, isMember: false });
});

test("ロビーから退出できるのはホスト以外の参加者だけ", () => {
  assert.equal(canLeaveOnlineRoomLobby({ isHost: false, isMember: true }, "lobby"), true);
  assert.equal(canLeaveOnlineRoomLobby({ isHost: true, isMember: true }, "lobby"), false);
  assert.equal(canLeaveOnlineRoomLobby({ isHost: false, isMember: true }, "playing"), false);
});

test("デバッグ用プレイヤーはホストがデバッグ中のロビーでだけ削除できる", () => {
  const players = [{ id: "host" }, { id: "member" }, { id: "dummy-generated" }, { id: "legacy-dummy", isDummy: true }];
  assert.equal(isOnlineRoomDebugPlayer(players[2]), true);
  assert.equal(isOnlineRoomDebugPlayer(players[3]), true);
  assert.equal(isOnlineRoomDebugPlayer(players[1]), false);

  const base = { actorId: "host", debugMode: true, hostId: "host", phase: "lobby", players, targetPlayerId: "dummy-generated" };
  assert.equal(canRemoveOnlineRoomDebugPlayer(base), true);
  assert.equal(canRemoveOnlineRoomDebugPlayer({ ...base, actorId: "member" }), false);
  assert.equal(canRemoveOnlineRoomDebugPlayer({ ...base, debugMode: false }), false);
  assert.equal(canRemoveOnlineRoomDebugPlayer({ ...base, phase: "clue" }), false);
  assert.equal(canRemoveOnlineRoomDebugPlayer({ ...base, targetPlayerId: "member" }), false);
});
