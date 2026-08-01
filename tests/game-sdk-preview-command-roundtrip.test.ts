import assert from "node:assert/strict";
import test from "node:test";
import type {
  GameFieldsAuthenticatedIdentity,
  GameFieldsPlatformRoomRecord,
  GameFieldsPlatformRoomPersistence,
} from "@game-fields/game-runtime";
import {
  createAuthenticatedGameSdkPlatformAdapter,
} from "../lib/game-sdk-platform-adapter.ts";
import {
  sdkCountUpServerModule,
  type SdkCountUpCommand,
  type SdkCountUpRoom,
} from "./fixtures/sdk-count-up-game.ts";

function commandHarness() {
  let stored: GameFieldsPlatformRoomRecord<SdkCountUpRoom> | null = null;
  const delays = {
    roomLoad: 0,
    applyCommand: 0,
    compareAndSet: 0,
    presentRoom: 0,
  };
  const counters = {
    roomLoad: 0,
    applyCommand: 0,
    compareAndSet: 0,
    presentRoom: 0,
  };
  const clone = <T>(value: T): T => structuredClone(value);
  const persistence: GameFieldsPlatformRoomPersistence<SdkCountUpRoom> = {
    async create(record) {
      if (stored) return "exists";
      stored = clone(record);
      return "created";
    },
    async load(code) {
      fakePerformanceNow += delays.roomLoad;
      counters.roomLoad += 1;
      return stored?.code === code ? clone(stored) : null;
    },
    async compareAndSet(expectedRevision, record) {
      fakePerformanceNow += delays.compareAndSet;
      counters.compareAndSet += 1;
      if (!stored) return "missing";
      if (stored.revision !== expectedRevision) return "conflict";
      stored = clone(record);
      return "saved";
    },
  };
  const serverModule = {
    ...sdkCountUpServerModule,
    async applyCommand(
      room: Readonly<SdkCountUpRoom>,
      command: SdkCountUpCommand,
      context: Parameters<typeof sdkCountUpServerModule.applyCommand>[2],
    ) {
      fakePerformanceNow += delays.applyCommand;
      counters.applyCommand += 1;
      return sdkCountUpServerModule.applyCommand(room, command, context);
    },
    async presentRoom(
      room: Readonly<SdkCountUpRoom>,
      context: Parameters<typeof sdkCountUpServerModule.presentRoom>[1],
    ) {
      fakePerformanceNow += delays.presentRoom;
      counters.presentRoom += 1;
      return sdkCountUpServerModule.presentRoom(room, context);
    },
  };
  let identity: GameFieldsAuthenticatedIdentity = {
    playerId: "host-account",
    displayName: "Host",
    debugAccess: true,
  };
  let sequence = 0;
  const adapter = createAuthenticatedGameSdkPlatformAdapter({
    module: serverModule,
    persistence,
    resolveIdentity: async () => identity,
    now: () => 1_000 + sequence,
    createRequestId: () => `preview-harness-${++sequence}`,
  });
  return {
    adapter,
    counters,
    reset() {
      counters.roomLoad = 0;
      counters.applyCommand = 0;
      counters.compareAndSet = 0;
      counters.presentRoom = 0;
    },
    setIdentity(next: GameFieldsAuthenticatedIdentity) {
      identity = next;
    },
    setDelays(next: Partial<typeof delays>) {
      Object.assign(delays, next);
    },
  };
}

let fakePerformanceNow = 0;

test("T-66 DEBUG proxy returns one final projection without the dummy intermediate View", async () => {
  const harness = commandHarness();
  let room = await harness.adapter.createRoom({
    roomCode: "TRACE",
    create: { settings: { target: 3 }, app: {} },
  });
  room = (await harness.adapter.sendCommand({
    code: room.code,
    envelope: {
      commandId: "preview-add-dummy-0001",
      expectedRevision: room.revision,
      command: { type: "room/debug-add-dummy" },
    },
  })).room;
  harness.setIdentity({
    playerId: "player-account",
    displayName: "Player",
    debugAccess: false,
  });
  room = (await harness.adapter.sendCommand({
    code: room.code,
    envelope: {
      commandId: "preview-join-player-001",
      expectedRevision: room.revision,
      command: { type: "room/join" },
    },
  })).room;
  harness.setIdentity({
    playerId: "host-account",
    displayName: "Host",
    debugAccess: true,
  });
  room = (await harness.adapter.sendCommand({
    code: room.code,
    envelope: {
      commandId: "preview-start-room-001",
      expectedRevision: room.revision,
      command: { type: "game/start" },
    },
  })).room;

  harness.reset();
  const result = await harness.adapter.sendCommand({
    code: room.code,
    finalViewer: 0,
    envelope: {
      commandId: "preview-dummy-command1",
      expectedRevision: room.revision,
      command: {
        type: "room/debug-act-as-dummy",
        seat: 1,
        command: { type: "game/count-up" },
      } as unknown as SdkCountUpCommand,
    },
  });

  assert.equal(result.room.view.app.lastActorSeat, 1);
  assert.equal(result.room.view.common.players[0]?.isSelf, true);
  assert.equal(result.room.view.common.players[1]?.isSelf, false);
  assert.deepEqual(harness.counters, {
    roomLoad: 3,
    applyCommand: 1,
    compareAndSet: 1,
    presentRoom: 1,
  });

  harness.setIdentity({
    playerId: "host-account",
    displayName: "Host",
    debugAccess: false,
  });
  await assert.rejects(
    () => harness.adapter.sendCommand({
      code: room.code,
      finalViewer: 1,
      envelope: {
        commandId: "preview-illegal-viewer1",
        expectedRevision: result.revision,
        command: { type: "game/count-up" },
      },
    }),
    /DEBUG_ACCESS_REQUIRED/,
  );

  harness.setIdentity({
    playerId: "player-account",
    displayName: "Player",
    debugAccess: false,
  });
  await assert.rejects(
    () => harness.adapter.sendCommand({
      code: room.code,
      finalViewer: 0,
      envelope: {
        commandId: "preview-participant-proxy1",
        expectedRevision: result.revision,
        command: {
          type: "room/debug-act-as-dummy",
          seat: 1,
          command: { type: "game/count-up" },
        } as unknown as SdkCountUpCommand,
      },
    }),
    /DEBUG_ACCESS_REQUIRED/,
  );

  harness.setIdentity({
    playerId: "host-account",
    displayName: "Host",
    debugAccess: true,
  });
  await assert.rejects(
    () => harness.adapter.sendCommand({
      code: room.code,
      finalViewer: "spectator",
      envelope: {
        commandId: "preview-spectator-view1",
        expectedRevision: result.revision,
        command: { type: "game/count-up" },
      },
    }),
    /DEBUG_VIEWER_INVALID/,
  );
});

test("mock Redis, apply, and projection delays are recorded in their own intervals", async () => {
  const originalPerformance = globalThis.performance;
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => fakePerformanceNow },
  });
  try {
    fakePerformanceNow = 0;
    const harness = commandHarness();
    let room = await harness.adapter.createRoom({
      roomCode: "DELAY",
      create: { settings: { target: 3 }, app: {} },
    });
    room = (await harness.adapter.sendCommand({
      code: room.code,
      envelope: {
        commandId: "preview-delay-add-dummy",
        expectedRevision: room.revision,
        command: { type: "room/debug-add-dummy" },
      },
    })).room;
    harness.setDelays({
      roomLoad: 2,
      applyCommand: 7,
      compareAndSet: 13,
      presentRoom: 11,
    });
    const samples: Array<{ stage: string; durationMs: number }> = [];
    room = (await harness.adapter.sendCommand({
      code: room.code,
      timing: {
        record(stage, durationMs) {
          samples.push({ stage, durationMs });
        },
      },
      envelope: {
        commandId: "preview-delayed-command1",
        expectedRevision: room.revision,
        command: { type: "game/start" },
      },
    })).room;

    assert.equal(room.revision, 3);
    assert.deepEqual(samples, [
      { stage: "room-load", durationMs: 2 },
      { stage: "room-load", durationMs: 2 },
      { stage: "apply-command", durationMs: 7 },
      { stage: "room-cas", durationMs: 13 },
      { stage: "present-room", durationMs: 11 },
      { stage: "room-load", durationMs: 2 },
    ]);
  } finally {
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: originalPerformance,
    });
  }
});
