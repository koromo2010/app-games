import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameSdkMockRuntime,
  GameSdkRuntimeError,
} from "@game-fields/game-sdk/mock-runtime";
import { myFirstGameServerModule } from "../src/server-module.js";

const host = {
  playerId: "host-account",
  displayName: "Host",
  role: "host",
  debugAccess: false,
} as const;
const player = {
  playerId: "player-account",
  displayName: "Player",
  role: "player",
  debugAccess: false,
} as const;

test("ホスト1人でゲームを開始できる", async () => {
  const runtime = createGameSdkMockRuntime({ module: myFirstGameServerModule });
  const created = await runtime.createRoom({
    roomCode: "SOLO",
    create: {
      settings: { target: 2 },
      app: {},
    },
    actor: host,
  });
  const started = await runtime.sendCommand({
    code: "SOLO",
    envelope: { expectedRevision: created.revision, command: { type: "game/start" } },
    actor: host,
  });

  assert.equal(started.room.phase, "playing");
  assert.equal(started.room.view.common.players.length, 1);
});

test("ダミー2人で1ゲームを最後まで進められる", async () => {
  const runtime = createGameSdkMockRuntime({ module: myFirstGameServerModule });
  const created = await runtime.createRoom({
    roomCode: "TEST",
    create: {
      settings: { target: 2 },
      app: {},
    },
    actor: host,
  });
  const joined = await runtime.sendCommand({
    code: "TEST",
    envelope: { expectedRevision: created.revision, command: { type: "room/join" } },
    actor: player,
  });
  const started = await runtime.sendCommand({
    code: "TEST",
    envelope: { expectedRevision: joined.revision, command: { type: "game/start" } },
    actor: host,
  });
  const first = await runtime.sendCommand({
    code: "TEST",
    envelope: { expectedRevision: started.revision, command: { type: "game/advance" } },
    actor: host,
  });
  const finished = await runtime.sendCommand({
    code: "TEST",
    envelope: { expectedRevision: first.revision, command: { type: "game/advance" } },
    actor: player,
  });

  assert.equal(finished.room.phase, "result");
  assert.equal(finished.revision, 5);
  assert.equal(finished.room.view.app.count, 2);
  assert.equal("id" in finished.room.view.common.players[0]!, false);
});

test("ホスト専用操作を一般プレイヤーへ許可しない", async () => {
  const runtime = createGameSdkMockRuntime({ module: myFirstGameServerModule });
  await runtime.createRoom({
    roomCode: "AUTH",
    create: {
      settings: { target: 2 },
      app: {},
    },
    actor: host,
  });
  await runtime.sendCommand({
    code: "AUTH",
    envelope: { expectedRevision: 1, command: { type: "room/join" } },
    actor: player,
  });
  await assert.rejects(
    () => runtime.sendCommand({
      code: "AUTH",
      envelope: { expectedRevision: 2, command: { type: "game/start" } },
      actor: player,
    }),
    /HOST_REQUIRED/,
  );
});

test("古いrevisionを拒否し、公開Viewへ内部IDを出さない", async () => {
  const runtime = createGameSdkMockRuntime({ module: myFirstGameServerModule });
  const created = await runtime.createRoom({
    roomCode: "SAFE",
    create: {
      settings: { target: 3 },
      app: {},
    },
    actor: host,
  });
  const spectator = await runtime.readRoom("SAFE", {
    playerId: null,
    role: "spectator",
    debugAccess: false,
  });
  assert.equal(JSON.stringify(spectator).includes(host.playerId), false);

  await assert.rejects(
    () => runtime.sendCommand({
      code: "SAFE",
      envelope: { expectedRevision: created.revision - 1, command: { type: "game/start" } },
      actor: host,
    }),
    (error: unknown) => error instanceof GameSdkRuntimeError
      && error.code === "STALE_REVISION"
      && error.status === 409,
  );
});
