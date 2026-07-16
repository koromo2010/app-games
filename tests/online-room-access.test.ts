import assert from "node:assert/strict";
import test from "node:test";
import { canLeaveOnlineRoomLobby, onlineRoomActorAccess } from "../lib/online-room-access.ts";

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
