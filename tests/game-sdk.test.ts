import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_SDK_VERSION,
  defineGameManifest,
  parseGameSdkSettingDefinitions,
  type GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import { createGameSdkMockRuntime, GameSdkRuntimeError } from "@game-fields/game-sdk/mock-runtime";
import { advanceGameSdkRoom, defineGameServerModule } from "@game-fields/game-sdk/runtime";

const manifest = defineGameManifest({
  sdkVersion: GAME_SDK_VERSION,
  id: "sdk-contract-test",
  title: { ja: "SDK契約テスト", en: "SDK contract test" },
  playMode: "online-room",
  minimumPlayers: 2,
  maximumPlayers: 4,
  supportsDebug: true,
  supportsSpectators: true,
  supportsReplay: false,
  supportsRating: false,
  usesLlm: false,
  settings: [{
    key: "timeLimitSeconds",
    label: { ja: "制限時間", en: "Time limit" },
    type: "select",
    defaultValue: 60,
    platformRole: "time-limit",
    options: [0, 30, 60],
  }],
});

type Room = GameSdkStoredRoom & {
  phase: "lobby" | "playing";
  hostPlayerId: string;
  secret: string;
};

type Command = { type: "start" } | { type: "change-secret"; secret: string };
type RoomView = { phase: Room["phase"]; secret?: string; canStart: boolean };

const testGameModule = defineGameServerModule<Room, { secret: string }, Command, RoomView>({
  manifest,
  createRoom(input, context) {
    return {
      code: context.roomCode,
      revision: 1,
      phase: "lobby",
      hostPlayerId: context.actor.playerId,
      secret: input.secret,
    };
  },
  applyCommand(room, command, context) {
    if (command.type === "start") {
      if (context.actor.playerId !== room.hostPlayerId) throw new Error("HOST_REQUIRED");
      return advanceGameSdkRoom(room, { phase: "playing" });
    }
    return advanceGameSdkRoom(room, { secret: command.secret });
  },
  presentRoom(room, context) {
    const isHost = context.viewer.playerId === room.hostPlayerId;
    return {
      phase: room.phase,
      ...(isHost ? { secret: room.secret } : {}),
      canStart: isHost && room.phase === "lobby",
    };
  },
});

const host = { playerId: "host-1", displayName: "Host", role: "host", debugAccess: false } as const;
const player = { playerId: "player-1", displayName: "Player", role: "player", debugAccess: false } as const;
const spectatorViewer = { playerId: null, role: "spectator", debugAccess: false } as const;

test("SDK manifest validates its version, id, localized titles and player range", () => {
  assert.equal(manifest.sdkVersion, 1);
  assert.throws(
    () => defineGameManifest({ ...manifest, id: "Invalid ID" }),
    /manifest id/,
  );
  assert.throws(
    () => defineGameManifest({ ...manifest, title: { ja: "SDK", en: "" } }),
    /title.en/,
  );
  assert.throws(
    () => defineGameManifest({ ...manifest, minimumPlayers: 5, maximumPlayers: 4 }),
    /maximumPlayers/,
  );
  assert.throws(
    () => defineGameManifest({ ...manifest, settings: [] }),
    /settings/,
  );
});

test("SDK settings require only time-limit while each app controls defaults and choices", () => {
  const settings = parseGameSdkSettingDefinitions([{
    key: "timeLimitSeconds",
    label: { ja: "回答時間", en: "Answer time" },
    type: "select",
    defaultValue: 45,
    platformRole: "time-limit",
    options: [
      { value: 0, label: { ja: "制限なし", en: "Unlimited" } },
      15,
      45,
      180,
    ],
  }, {
    key: "answerMode",
    label: { ja: "回答方式", en: "Answer mode" },
    type: "select",
    defaultValue: "yes-no",
    options: [
      { value: "yes-no", label: { ja: "はい・いいえ", en: "Yes or no" } },
      { value: "distance", label: { ja: "近さ", en: "Distance" } },
    ],
  }], { requireTimeLimit: true });
  assert.deepEqual(settings.map((setting) => setting.key), [
    "timeLimitSeconds",
    "answerMode",
  ]);
  assert.equal(settings.some((setting) => setting.platformRole === "maximum-players"), false);
  assert.equal(settings.some((setting) => setting.platformRole === "round-count"), false);
  assert.equal(settings[0]?.defaultValue, 45);
  assert.deepEqual(settings[0]?.options, [
    { value: 0, label: { ja: "制限なし", en: "Unlimited" } },
    15,
    45,
    180,
  ]);
  assert.throws(
    () => parseGameSdkSettingDefinitions([settings[1]], {
      requireTimeLimit: true,
    }),
    /time-limit/,
  );
  assert.throws(
    () => parseGameSdkSettingDefinitions([{
      ...settings[0],
      options: [45, 3601],
    }], { requireTimeLimit: true }),
    /0 to 3600/,
  );
});

test("mock Runtime keeps stored secrets behind viewer-specific presentation", async () => {
  const runtime = createGameSdkMockRuntime({ module: testGameModule, now: () => 1000 });
  const createdForHost = await runtime.createRoom({
    roomCode: "SAFE",
    create: { secret: "hidden-answer" },
    actor: host,
  });
  assert.equal(createdForHost.view.secret, "hidden-answer");

  const spectatorRoom = await runtime.readRoom("SAFE", spectatorViewer);
  assert.deepEqual(spectatorRoom?.view, {
    phase: "lobby",
    canStart: false,
  });
  assert.equal(JSON.stringify(spectatorRoom).includes("hidden-answer"), false);
});

test("mock Runtime applies trusted actors and enforces one-step revisions", async () => {
  const runtime = createGameSdkMockRuntime({ module: testGameModule });
  await runtime.createRoom({
    roomCode: "PLAY",
    create: { secret: "answer" },
    actor: host,
  });

  await assert.rejects(
    () => runtime.sendCommand({
      code: "PLAY",
      envelope: { expectedRevision: 1, command: { type: "start" } },
      actor: player,
    }),
    /HOST_REQUIRED/,
  );

  const started = await runtime.sendCommand({
    code: "PLAY",
    envelope: { expectedRevision: 1, command: { type: "start" } },
    actor: host,
  });
  assert.equal(started.room.phase, "playing");
  assert.equal(started.revision, 2);

  await assert.rejects(
    () => runtime.sendCommand({
      code: "PLAY",
      envelope: { expectedRevision: 1, command: { type: "change-secret", secret: "late" } },
      actor: host,
    }),
    (error: unknown) => error instanceof GameSdkRuntimeError
      && error.code === "STALE_REVISION"
      && error.status === 409,
  );
});

test("mock Runtime clones inputs and inspection results instead of leaking stored state", async () => {
  const runtime = createGameSdkMockRuntime({ module: testGameModule });
  const create = { secret: "original" };
  await runtime.createRoom({
    roomCode: "CLONE",
    create,
    actor: host,
  });
  create.secret = "mutated outside";

  const inspected = runtime.inspectStoredRoom("CLONE");
  assert.equal(inspected?.secret, "original");
  if (inspected) inspected.secret = "mutated inspection";
  assert.equal(runtime.inspectStoredRoom("CLONE")?.secret, "original");
});

test("mock Runtime rechecks CAS after concurrent asynchronous Commands", async () => {
  let entered = 0;
  let releaseCommands = () => {};
  let markBothEntered = () => {};
  const commandGate = new Promise<void>((resolve) => { releaseCommands = resolve; });
  const bothEntered = new Promise<void>((resolve) => { markBothEntered = resolve; });
  const concurrentModule = defineGameServerModule<Room, { secret: string }, Command, RoomView>({
    ...testGameModule,
    async applyCommand(room) {
      entered += 1;
      if (entered === 2) markBothEntered();
      await commandGate;
      return advanceGameSdkRoom(room, { phase: "playing" });
    },
  });
  const runtime = createGameSdkMockRuntime({
    module: concurrentModule,
    initialRooms: [{
      code: "RACE",
      revision: 1,
      phase: "lobby",
      hostPlayerId: host.playerId,
      secret: "answer",
    }],
  });

  const first = runtime.sendCommand({
    code: "RACE",
    envelope: { expectedRevision: 1, command: { type: "start" } },
    actor: host,
  });
  const second = runtime.sendCommand({
    code: "RACE",
    envelope: { expectedRevision: 1, command: { type: "start" } },
    actor: host,
  });
  await bothEntered;
  releaseCommands();
  const results = await Promise.allSettled([first, second]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.equal(
    rejected?.status === "rejected" && rejected.reason instanceof GameSdkRuntimeError
      ? rejected.reason.code
      : null,
    "STALE_REVISION",
  );
  assert.equal(runtime.inspectStoredRoom("RACE")?.revision, 2);
});
