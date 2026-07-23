import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOnlineRoomDebugParticipantCommand,
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

type TestRoom = {
  hostId: string;
  phase: string;
  debugMode: boolean;
  debugReplayEnabled: boolean;
  players: Array<{ id: string; name: string; joinedAt?: number; isDummy?: boolean }>;
  lobbyReturn?: {
    reason: "round-result";
    round: number;
    startedAt: number;
    returnedPlayerIds: string[];
  };
  adjustedForPlayers: string[];
};

const room = (): TestRoom => ({
  hostId: "host",
  phase: "lobby",
  debugMode: true,
  debugReplayEnabled: true,
  players: players.map((player) => ({ ...player })),
  lobbyReturn: {
    reason: "round-result",
    round: 1,
    startedAt: 1,
    returnedPlayerIds: players.map((player) => player.id),
  },
  adjustedForPlayers: [],
});

const options = {
  forbiddenError: "ROOM_FORBIDDEN",
  assertCanAdd: (current: TestRoom) => {
    if (current.players.length >= 4) throw new Error("ROOM_FULL");
  },
  createPlayer: (
    seed: {
      id: string;
      name: string;
      joinedAt: number;
      debugParticipantIndex: number;
    },
  ) => ({
    id: seed.id,
    name: seed.name,
    joinedAt: seed.joinedAt,
    isDummy: true,
  }),
  afterParticipantsChanged: (
    current: TestRoom,
    change: { players: TestRoom["players"] },
  ) => ({
    ...current,
    adjustedForPlayers: change.players.map((player) => player.id),
  }),
};

test("共通Commandが追加・ロビー復帰・ゲーム固有補正を一度に適用する", () => {
  const result = applyOnlineRoomDebugParticipantCommand(
    room(),
    "host",
    { type: "debug-add-player" },
    options,
  );
  const added = result.room.players.at(-1);

  assert.equal(added?.name, "ダミー4");
  assert.equal(added?.isDummy, true);
  assert.ok(result.room.lobbyReturn?.returnedPlayerIds.includes(added?.id ?? ""));
  assert.deepEqual(
    result.room.adjustedForPlayers,
    result.room.players.map((player) => player.id),
  );
});

test("共通Commandが個別削除の認可と削除ID返却を担う", () => {
  const result = applyOnlineRoomDebugParticipantCommand(
    room(),
    "host",
    { type: "debug-remove-player", targetPlayerId: "dummy-one" },
    options,
  );

  assert.deepEqual(result.removedPlayerIds, ["dummy-one"]);
  assert.deepEqual(
    result.room.players.map((player) => player.id),
    ["host", "dummy-three"],
  );
  assert.throws(() => applyOnlineRoomDebugParticipantCommand(
    room(),
    "dummy-one",
    { type: "debug-remove-player", targetPlayerId: "dummy-three" },
    options,
  ), /ROOM_FORBIDDEN/);
  assert.throws(() => applyOnlineRoomDebugParticipantCommand(
    room(),
    "host",
    { type: "debug-remove-player", targetPlayerId: "host" },
    options,
  ), /ROOM_FORBIDDEN/);
});

test("DEBUG OFFは全ダミーとプレイバック設定を共通整理する", () => {
  const result = applyOnlineRoomDebugParticipantCommand(
    room(),
    "host",
    { type: "set-debug", enabled: false },
    options,
  );

  assert.equal(result.room.debugMode, false);
  assert.equal(result.room.debugReplayEnabled, false);
  assert.deepEqual(result.removedPlayerIds, ["dummy-one", "dummy-three"]);
  assert.deepEqual(result.room.players.map((player) => player.id), ["host"]);
  assert.deepEqual(result.room.lobbyReturn?.returnedPlayerIds, ["host"]);
});
