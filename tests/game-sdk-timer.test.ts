import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_SDK_VERSION,
  defineGameManifest,
  type GameSdkTrustedActor,
} from "@game-fields/game-sdk";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import {
  createGameSdkOnlineRoomModule,
  defineGameSdkOnlineRoomAppSet,
} from "@game-fields/game-sdk/runtime";

const host: GameSdkTrustedActor = {
  playerId: "host",
  displayName: "Host",
  role: "host",
  debugAccess: false,
};
const player: GameSdkTrustedActor = {
  playerId: "player",
  displayName: "Player",
  role: "player",
  debugAccess: false,
};
const manifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "sdk-timer-proof",
  title: { ja: "タイマー実証", en: "Timer proof" },
  playMode: "online-room",
  minimumPlayers: 2,
  maximumPlayers: 4,
  supportsDebug: false,
  supportsSpectators: false,
  supportsReplay: false,
  supportsRating: false,
  usesLlm: false,
  settings: [{
    key: "timeLimitSeconds",
    label: { ja: "制限時間", en: "Time limit" },
    type: "select",
    defaultValue: 30,
    platformRole: "time-limit",
    options: [0, 30, 60],
  }],
});
const appSet = defineGameSdkOnlineRoomAppSet({
  manifest,
  defaultSettings: { timeLimitSeconds: 30 },
  timer: {
    durationSeconds(settings) {
      return settings.timeLimitSeconds;
    },
    graceMs: 1_500,
  },
  expireAppTurn(room) {
    return {
      phase: "playing",
      app: { turns: room.app.turns + 1 },
      timer: "reset",
      timerOwnerPlayerId: "host",
      timedOutPlayerIds: ["host"],
    };
  },
  createAppState() {
    return { turns: 0 };
  },
  resetAppState() {
    return { turns: 0 };
  },
  applyAppCommand(room, command: {
    type: "game/start" | "game/complete-turn" | "game/finish" | "game/reject";
  }) {
    if (command.type === "game/reject") throw new Error("REJECTED");
    if (command.type === "game/start") {
      return {
        phase: "playing",
        app: room.app,
        timerOwnerPlayerId: "host",
      };
    }
    if (command.type === "game/finish") {
      return {
        phase: "result",
        app: { turns: room.app.turns + 1 },
        timer: "stop" as const,
      };
    }
    return {
      phase: "playing",
      app: { turns: room.app.turns + 1 },
      timer: "reset" as const,
      timerOwnerPlayerId: "host",
    };
  },
  presentApp(room) {
    return { view: { turns: room.app.turns } };
  },
});

test("SDK basic timer resets only after an accepted turn Command", async () => {
  let now = 1_000;
  const runtime = createGameSdkMockRuntime({
    module: createGameSdkOnlineRoomModule(appSet),
    now: () => now,
  });
  const created = await runtime.createRoom({
    roomCode: "TIME",
    create: { app: {} },
    actor: host,
  });
  assert.deepEqual(created.view.common.timer, {
    durationSeconds: 30,
    startedAt: null,
    deadlineAt: null,
    turnSequence: 0,
  });

  const joined = await runtime.sendCommand({
    code: "TIME",
    envelope: {
      expectedRevision: created.revision,
      command: { type: "room/join" },
    },
    actor: player,
  });
  now = 2_000;
  const started = await runtime.sendCommand({
    code: "TIME",
    envelope: {
      expectedRevision: joined.revision,
      command: { type: "game/start" },
    },
    actor: host,
  });
  assert.deepEqual(started.room.view.common.timer, {
    durationSeconds: 30,
    startedAt: 2_000,
    deadlineAt: 32_000,
    turnSequence: 1,
    ownerSeat: 0,
  });

  now = 9_000;
  await assert.rejects(
    runtime.sendCommand({
      code: "TIME",
      envelope: {
        expectedRevision: started.revision,
        command: { type: "game/reject" },
      },
      actor: host,
    }),
    /REJECTED/,
  );
  assert.equal(
    runtime.inspectStoredRoom("TIME")?.timer?.deadlineAt,
    32_000,
    "a rejected Command must not reset the deadline",
  );

  now = 10_000;
  const advanced = await runtime.sendCommand({
    code: "TIME",
    envelope: {
      expectedRevision: started.revision,
      command: { type: "game/complete-turn" },
    },
    actor: host,
  });
  assert.deepEqual(advanced.room.view.common.timer, {
    durationSeconds: 30,
    startedAt: 10_000,
    deadlineAt: 40_000,
    turnSequence: 2,
    ownerSeat: 0,
  });

  now = 12_000;
  const finished = await runtime.sendCommand({
    code: "TIME",
    envelope: {
      expectedRevision: advanced.revision,
      command: { type: "game/finish" },
    },
    actor: host,
  });
  assert.deepEqual(finished.room.view.common.timer, {
    durationSeconds: 30,
    startedAt: null,
    deadlineAt: null,
    turnSequence: 2,
  });
});

test("SDK timer expires on the server, applies grace and requires explicit recovery", async () => {
  let now = 1_000;
  const runtime = createGameSdkMockRuntime({
    module: createGameSdkOnlineRoomModule(appSet),
    now: () => now,
  });
  const created = await runtime.createRoom({
    roomCode: "LATE",
    create: { app: {} },
    actor: host,
  });
  const joined = await runtime.sendCommand({
    code: "LATE",
    envelope: {
      expectedRevision: created.revision,
      command: { type: "room/join" },
    },
    actor: player,
  });
  now = 2_000;
  const started = await runtime.sendCommand({
    code: "LATE",
    envelope: {
      expectedRevision: joined.revision,
      command: { type: "game/start" },
    },
    actor: host,
  });
  now = 33_499;
  await assert.rejects(runtime.sendCommand({
    code: "LATE",
    envelope: {
      expectedRevision: started.revision,
      command: { type: "room/expire-timer", turnSequence: 1 },
    },
    actor: player,
  }), /TIMER_NOT_EXPIRED/);

  now = 33_500;
  const firstTimeout = await runtime.sendCommand({
    code: "LATE",
    envelope: {
      expectedRevision: started.revision,
      command: { type: "room/expire-timer", turnSequence: 1 },
    },
    actor: player,
  });
  assert.equal(firstTimeout.room.view.common.timer?.durationSeconds, 30);

  now = 65_000;
  const secondTimeout = await runtime.sendCommand({
    code: "LATE",
    envelope: {
      expectedRevision: firstTimeout.revision,
      command: { type: "room/expire-timer", turnSequence: 2 },
    },
    actor: player,
  });
  assert.equal(secondTimeout.room.view.common.timer?.durationSeconds, 5);
  assert.equal(secondTimeout.room.view.common.players[0]?.reducedTime, true);

  const recovered = await runtime.sendCommand({
    code: "LATE",
    envelope: {
      expectedRevision: secondTimeout.revision,
      command: { type: "room/recover-timeout" },
    },
    actor: host,
  });
  assert.equal(recovered.room.view.common.players[0]?.reducedTime, false);
});
