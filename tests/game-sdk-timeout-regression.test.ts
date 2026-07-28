import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_SDK_VERSION,
  defineGameManifest,
  parseGameSdkSettingDefinitions,
  type GameSdkTrustedActor,
} from "@game-fields/game-sdk";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import {
  createGameSdkOnlineRoomModule,
  defineGameSdkOnlineRoomAppSet,
} from "@game-fields/game-sdk/runtime";
import {
  createGameSdkPlayerTimeoutState,
  gameSdkPlayerTimeLimitSeconds,
  recordGameSdkPlayerTimeout,
} from "../packages/game-sdk/src/modules/timeout.ts";

const host: GameSdkTrustedActor = {
  playerId: "host",
  displayName: "Host",
  role: "host",
  debugAccess: true,
};
const player: GameSdkTrustedActor = {
  playerId: "player",
  displayName: "Player",
  role: "player",
  debugAccess: false,
};

const manifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "timeout-regression",
  title: { ja: "時間切れ回帰", en: "Timeout regression" },
  playMode: "online-room",
  minimumPlayers: 2,
  maximumPlayers: 4,
  supportsDebug: true,
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
    options: [30, 60],
  }],
});

const appSet = defineGameSdkOnlineRoomAppSet({
  manifest,
  defaultSettings: { timeLimitSeconds: 30 },
  timer: {
    durationSeconds(settings) {
      return settings.timeLimitSeconds;
    },
  },
  expireAppTurn(room) {
    return {
      phase: "playing",
      app: room.app,
      timer: "reset" as const,
      timerOwnerPlayerId: "host",
      timedOutPlayerIds: ["host"],
    };
  },
  createAppState() {
    return {};
  },
  resetAppState() {
    return {};
  },
  applyAppCommand(room, command: { type: "game/start" | "game/finish" }) {
    if (command.type === "game/finish") {
      return {
        phase: "result",
        app: room.app,
        timer: "stop" as const,
      };
    }
    return {
      phase: "playing",
      app: room.app,
      timer: "reset" as const,
      timerOwnerPlayerId: "host",
    };
  },
  presentApp() {
    return { view: {} };
  },
});

test("DEBUG dummy timeout state never reduces its time limit", () => {
  const dummyId = "debug:dummy-1";
  let state = createGameSdkPlayerTimeoutState([dummyId]);
  state = recordGameSdkPlayerTimeout(state, dummyId, 1_000);
  state = recordGameSdkPlayerTimeout(state, dummyId, 2_000);
  state = recordGameSdkPlayerTimeout(state, dummyId, 3_000);

  assert.deepEqual(state.statuses[dummyId], {
    consecutiveTimeouts: 0,
    reducedTime: false,
  });
  assert.equal(gameSdkPlayerTimeLimitSeconds(30, state, dummyId), 30);
});

test("normal players still receive the five-second reduction", () => {
  let state = createGameSdkPlayerTimeoutState(["player"]);
  state = recordGameSdkPlayerTimeout(state, "player", 1_000);
  state = recordGameSdkPlayerTimeout(state, "player", 2_000);

  assert.equal(state.statuses.player?.reducedTime, true);
  assert.equal(gameSdkPlayerTimeLimitSeconds(30, state, "player"), 5);
  assert.equal(gameSdkPlayerTimeLimitSeconds(0, state, "player"), 0);
});

test("rematch and the next lobby-to-game start reset timeout penalties", async () => {
  let now = 1_000;
  const runtime = createGameSdkMockRuntime({
    module: createGameSdkOnlineRoomModule(appSet),
    now: () => now,
  });
  const created = await runtime.createRoom({
    roomCode: "RSET",
    create: { app: {} },
    actor: host,
  });
  const joined = await runtime.sendCommand({
    code: "RSET",
    envelope: {
      expectedRevision: created.revision,
      command: { type: "room/join" },
    },
    actor: player,
  });
  const started = await runtime.sendCommand({
    code: "RSET",
    envelope: {
      expectedRevision: joined.revision,
      command: { type: "game/start" },
    },
    actor: host,
  });

  now = 32_501;
  const firstTimeout = await runtime.sendCommand({
    code: "RSET",
    envelope: {
      expectedRevision: started.revision,
      command: { type: "room/expire-timer", turnSequence: 1 },
    },
    actor: player,
  });
  now = 64_002;
  const secondTimeout = await runtime.sendCommand({
    code: "RSET",
    envelope: {
      expectedRevision: firstTimeout.revision,
      command: { type: "room/expire-timer", turnSequence: 2 },
    },
    actor: player,
  });
  assert.equal(secondTimeout.room.view.common.players[0]?.reducedTime, true);

  const finished = await runtime.sendCommand({
    code: "RSET",
    envelope: {
      expectedRevision: secondTimeout.revision,
      command: { type: "game/finish" },
    },
    actor: host,
  });
  const rematched = await runtime.sendCommand({
    code: "RSET",
    envelope: {
      expectedRevision: finished.revision,
      command: { type: "room/rematch" },
    },
    actor: host,
  });
  assert.equal(rematched.room.view.common.players[0]?.reducedTime, false);

  const restarted = await runtime.sendCommand({
    code: "RSET",
    envelope: {
      expectedRevision: rematched.revision,
      command: { type: "game/start" },
    },
    actor: host,
  });
  assert.equal(restarted.room.view.common.players[0]?.reducedTime, false);
  assert.equal(restarted.room.view.common.timer?.durationSeconds, 30);
});

test("custom time-limit select definitions receive one no-limit option", () => {
  const [setting] = parseGameSdkSettingDefinitions([{
    key: "turnSeconds",
    label: { ja: "持ち時間", en: "Turn time" },
    type: "select",
    defaultValue: 30,
    platformRole: "time-limit",
    options: [30, 60],
  }]);

  assert.deepEqual(
    setting?.options?.map((option) => typeof option === "object" ? option.value : option),
    [0, 30, 60],
  );
});
