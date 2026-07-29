import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameSdkHttpClientRuntime,
  GameSdkHttpClientRuntimeError,
  type GameSdkWebSocketLike,
} from "@game-fields/game-sdk/client-runtime";
import type {
  GameFieldsAuthenticatedIdentity,
  GameFieldsPlatformRoomRecord,
  GameFieldsPlatformRuntimeContract,
} from "@game-fields/game-runtime";
import {
  createAuthenticatedGameSdkPlatformAdapter,
  type AuthenticatedGameSdkPlatformAdapter,
} from "../lib/game-sdk-platform-adapter.ts";
import { createGameSdkOnlineRoomHttpHandlers } from "../lib/game-sdk-online-room-http.ts";
import type {
  GameSdkPlatformActiveRoomClaim,
  GameSdkPlatformRoomStore,
} from "../lib/game-sdk-platform-room-store.ts";
import {
  approvedGameSdkIds,
  approvedGameSdkRegistration,
} from "../lib/game-sdk-server-registry.ts";
import {
  sdkCountUpServerModule,
  type SdkCountUpCommand,
  type SdkCountUpCreateInput,
  type SdkCountUpRoom,
  type SdkCountUpRoomView,
} from "./fixtures/sdk-count-up-game.ts";

function memoryRoomStore(): GameSdkPlatformRoomStore<SdkCountUpRoom> {
  const rooms = new Map<string, GameFieldsPlatformRoomRecord<SdkCountUpRoom>>();
  const activeRooms = new Map<string, string>();
  const clone = <T>(value: T) => structuredClone(value);
  const playerIds = (record: GameFieldsPlatformRoomRecord<SdkCountUpRoom>) =>
    record.room.players.map((roomPlayer) => roomPlayer.id);
  const activePlayerIds = (
    record: GameFieldsPlatformRoomRecord<SdkCountUpRoom>,
  ) => record.room.players
    .filter((roomPlayer) => roomPlayer.isDummy !== true)
    .map((roomPlayer) => roomPlayer.id);
  const store: GameSdkPlatformRoomStore<SdkCountUpRoom> = {
    async create(record) {
      if (rooms.has(record.code)) return "exists";
      rooms.set(record.code, clone(record));
      for (const playerId of activePlayerIds(record)) {
        const active = activeRooms.get(playerId);
        if (!active || active === record.code) activeRooms.set(playerId, record.code);
      }
      return "created";
    },
    async load(code) {
      const record = rooms.get(code);
      return record ? clone(record) : null;
    },
    async compareAndSet(expectedRevision, record) {
      const current = rooms.get(record.code);
      if (!current) return "missing";
      if (current.revision !== expectedRevision) return "conflict";
      rooms.set(record.code, clone(record));
      for (const playerId of activePlayerIds(record)) {
        const active = activeRooms.get(playerId);
        if (!active || active === record.code) activeRooms.set(playerId, record.code);
      }
      return "saved";
    },
    async claimResultOutbox(code, eventId, now) {
      const record = rooms.get(code);
      const entry = record?.resultOutbox.find((item) => item.eventId === eventId);
      if (
        !record
        || !entry
        || entry.status === "completed"
        || (
          entry.status === "result-persisting"
          && (entry.leaseExpiresAt ?? 0) > now
        )
      ) return null;
      entry.status = "result-persisting";
      entry.attempts += 1;
      entry.updatedAt = now;
      entry.leaseExpiresAt = now + 60_000;
      return clone(record);
    },
    async completeResultOutbox(code, eventId, now) {
      const entry = rooms.get(code)?.resultOutbox.find(
        (item) => item.eventId === eventId,
      );
      if (!entry) return false;
      entry.status = "completed";
      entry.updatedAt = now;
      delete entry.leaseExpiresAt;
      delete entry.lastErrorCode;
      return true;
    },
    async retryResultOutbox(code, eventId, now, errorCode) {
      const entry = rooms.get(code)?.resultOutbox.find(
        (item) => item.eventId === eventId,
      );
      if (!entry) return false;
      entry.status = "result-confirmed";
      entry.updatedAt = now;
      entry.lastErrorCode = errorCode;
      delete entry.leaseExpiresAt;
      return true;
    },
    async claimActiveRoom(playerId, targetCode, replacement) {
      const previousCode = activeRooms.get(playerId) ?? null;
      const previous = previousCode ? rooms.get(previousCode) : null;
      const replacementCode = replacement?.code.trim().toUpperCase();
      const canReplaceCurrent = Boolean(
        replacement
        && previous
        && previousCode === previous.code
        && previous.code === replacementCode
        && playerIds(previous).includes(playerId)
        && previous.runtimeContract.packageRevision === replacement.packageRevision
        && replacement.packageRevision !== replacement.nextPackageRevision
      );
      if (replacement && !canReplaceCurrent) {
        throw new Error("GAME_SDK_ACTIVE_ROOM_REPLACEMENT_FORBIDDEN");
      }
      if (
        previous
        && previousCode !== targetCode
        && playerIds(previous).includes(playerId)
        && previous.phase !== "result"
        && !canReplaceCurrent
      ) {
        throw new Error("PLAYER_ACTIVE_ROOM");
      }
      activeRooms.set(playerId, targetCode);
      return {
        playerId,
        targetCode,
        previousCode,
        changed: previousCode !== targetCode,
      };
    },
    async rollbackActiveRoomClaim(claim: GameSdkPlatformActiveRoomClaim) {
      if (!claim.changed || activeRooms.get(claim.playerId) !== claim.targetCode) return;
      if (claim.previousCode) activeRooms.set(claim.playerId, claim.previousCode);
      else activeRooms.delete(claim.playerId);
    },
    async releaseActiveRoom(playerId, roomCode) {
      if (activeRooms.get(playerId) === roomCode) activeRooms.delete(playerId);
    },
    async loadActiveRoom(playerId) {
      const code = activeRooms.get(playerId);
      const record = code ? rooms.get(code) : null;
      if (!record || !playerIds(record).includes(playerId)) {
        activeRooms.delete(playerId);
        return null;
      }
      return clone(record);
    },
    async listRooms(_cursor, maximumPlayers, packageRevision) {
      return {
        rooms: [...rooms.values()]
          .filter((record) => (
            record.phase === "lobby"
            && (
              !packageRevision
              || record.runtimeContract.packageRevision === packageRevision
            )
            && record.room.players.length < maximumPlayers
          ))
          .map((record) => ({
            code: record.code,
            phase: record.phase,
            revision: record.revision,
            packageRevision: record.runtimeContract.packageRevision,
            playerCount: record.room.players.length,
            maximumPlayers,
            updatedAt: record.updatedAt,
          })),
        nextCursor: null,
      };
    },
    async dissolveRoom(code, actorId) {
      const record = rooms.get(code);
      if (!record) return null;
      if (record.hostPlayerId !== actorId) throw new Error("HOST_REQUIRED");
      if (record.phase !== "lobby" && record.phase !== "result") {
        throw new Error("GAME_IN_PROGRESS");
      }
      rooms.delete(code);
      for (const playerId of playerIds(record)) {
        if (activeRooms.get(playerId) === code) activeRooms.delete(playerId);
      }
      return clone(record);
    },
    async dissolveHostedRooms(actorId, beforeDissolve) {
      const targets = [...rooms.values()].filter((record) => record.hostPlayerId === actorId);
      if (targets.some((record) => record.phase !== "lobby" && record.phase !== "result")) {
        throw new Error("GAME_IN_PROGRESS");
      }
      for (const record of targets) {
        await beforeDissolve?.(clone(record));
        await store.dissolveRoom(record.code, actorId);
      }
      return clone(targets);
    },
    async publishRevision() {},
  };
  return store;
}

function httpFetcher(
  handlers: ReturnType<typeof createGameSdkOnlineRoomHttpHandlers>,
) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "GET") return handlers.GET(request);
    if (request.method === "POST") return handlers.POST(request);
    if (request.method === "PATCH") return handlers.PATCH(request);
    if (request.method === "DELETE") return handlers.DELETE(request);
    return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
  };
}

const host: GameFieldsAuthenticatedIdentity = {
  playerId: "host-account",
  displayName: "Host",
  debugAccess: false,
};
const debugHost: GameFieldsAuthenticatedIdentity = {
  ...host,
  debugAccess: true,
};

const player: GameFieldsAuthenticatedIdentity = {
  playerId: "player-account",
  displayName: "Player",
  debugAccess: false,
};

function packageRuntimeContract(
  packageRevision: string,
  packageRootSha256: string,
): GameFieldsPlatformRuntimeContract {
  return {
    packageRevision,
    packageRootSha256,
    runtimeVersion: "game-fields-runner-test",
    sdkContractVersion: 2,
    roomSchemaVersion: 2,
    resourceProtocolVersion: 1,
    clientBridgeVersion: 1,
  };
}

test("SDK HTTP Client Runtimeはactorを送らず認証adapterと永続Runtimeを縦断する", async () => {
  let identity = host;
  const adapter = createAuthenticatedGameSdkPlatformAdapter({
    module: sdkCountUpServerModule,
    roomStore: memoryRoomStore(),
    resolveIdentity: async () => identity,
    now: () => 1_000,
    createRequestId: () => "request-http-runtime",
  });
  const handlers = createGameSdkOnlineRoomHttpHandlers({
    adapter: adapter as unknown as AuthenticatedGameSdkPlatformAdapter<
      unknown,
      { type: string },
      unknown
    >,
  });
  const runtime = createGameSdkHttpClientRuntime<
    SdkCountUpCreateInput,
    SdkCountUpCommand,
    SdkCountUpRoomView
  >({
    endpoint: "https://game-fields.test/api/game-sdk/sdk-count-up-proof/rooms",
    fetcher: httpFetcher(handlers),
    gameId: "sdk-count-up-proof",
  });

  let room = await runtime.createRoom({
    roomCode: "race",
    create: {
      settings: { target: 3 },
      app: {},
    },
  });
  assert.equal(room.code, "RACE");
  assert.deepEqual(
    room.view.common.players.map((roomPlayer) => roomPlayer.displayName),
    ["Host"],
  );
  assert.equal(JSON.stringify(room).includes(host.playerId), false);
  assert.equal((await runtime.readActiveRoom())?.code, "RACE");
  assert.deepEqual(await runtime.listRooms(), {
    rooms: [{
      code: "RACE",
      phase: "lobby",
      revision: 1,
      packageRevision: "builtin:sdk-count-up-proof:sdk-2",
      playerCount: 1,
      maximumPlayers: 4,
      updatedAt: 1_000,
    }],
    nextCursor: null,
  });
  await assert.rejects(
    () => runtime.createRoom({
      roomCode: "NEXT",
      create: {
        settings: { target: 2 },
        app: {},
      },
    }),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 409
      && error.code === "PLAYER_ACTIVE_ROOM"
    ),
  );

  identity = player;
  assert.equal(await runtime.readActiveRoom(), null);
  const beforeJoin = await runtime.readRoom("race");
  assert.equal(beforeJoin?.view.common.isMember, false);
  room = (await runtime.sendCommand("race", {
    expectedRevision: room.revision,
    command: {
      type: "room/join",
      playerId: "forged-account",
    } as unknown as SdkCountUpCommand,
  })).room;
  assert.deepEqual(
    room.view.common.players.map((roomPlayer) => roomPlayer.displayName),
    ["Host", "Player"],
  );
  assert.equal(JSON.stringify(room).includes("forged-account"), false);
  assert.equal((await runtime.readActiveRoom())?.code, "RACE");
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "room/leave" },
  })).room;
  assert.deepEqual(
    room.view.common.players.map((roomPlayer) => roomPlayer.displayName),
    ["Host"],
  );
  assert.equal(await runtime.readActiveRoom(), null);
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "room/join" },
  })).room;

  identity = host;
  await assert.rejects(
    () => runtime.readRoomAsDebugViewer("RACE", 1),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 403
      && error.code === "DEBUG_ACCESS_REQUIRED"
    ),
  );
  identity = debugHost;
  const playerView = await runtime.readRoomAsDebugViewer("RACE", 1);
  assert.equal(
    playerView?.view.common.players.find((candidate) => candidate.isSelf)?.seat,
    1,
  );
  await assert.rejects(
    () => runtime.readRoomAsDebugViewer("RACE", "spectator"),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 400
      && error.code === "DEBUG_VIEWER_INVALID"
    ),
  );
  await assert.rejects(
    () => runtime.readRoomAsDebugViewer("RACE", 99),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 400
      && error.code === "DEBUG_VIEWER_INVALID"
    ),
  );

  identity = host;
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "game/start" },
  })).room;
  assert.equal(room.phase, "playing");
  assert.deepEqual((await runtime.listRooms()).rooms, []);

  await assert.rejects(
    () => runtime.sendCommand("RACE", {
      expectedRevision: 1,
      command: { type: "game/count-up" },
    }),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 409
      && error.code === "STALE_REVISION"
    ),
  );

  identity = player;
  await assert.rejects(
    () => runtime.dissolveRoom("RACE"),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 403
      && error.code === "HOST_REQUIRED"
    ),
  );

  identity = host;
  await assert.rejects(
    () => runtime.dissolveRoom("RACE"),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 409
      && error.code === "GAME_IN_PROGRESS"
    ),
  );
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "game/count-up" },
  })).room;
  identity = player;
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "game/count-up" },
  })).room;
  identity = host;
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "game/count-up" },
  })).room;
  assert.equal(room.phase, "result");
  const nextRoom = await runtime.createRoom({
    roomCode: "NEXT",
    create: {
      settings: { target: 2 },
      app: {},
    },
  });
  assert.equal(nextRoom.code, "NEXT");
  assert.equal((await runtime.readActiveRoom())?.code, "NEXT");
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "room/rematch" },
  })).room;
  assert.equal(room.phase, "lobby");
  assert.equal(
    (await runtime.readActiveRoom())?.code,
    "NEXT",
    "rematching an old result must not steal the newer active-room index",
  );
  assert.equal(await runtime.dissolveRoom("RACE"), true);
  assert.equal(await runtime.readRoom("RACE"), null);
  assert.equal((await runtime.readActiveRoom())?.code, "NEXT");
  identity = player;
  assert.equal(await runtime.readActiveRoom(), null);
  identity = host;
  assert.equal(await runtime.dissolveHostedRooms(), 1);
  assert.equal(await runtime.readRoom("NEXT"), null);
});

test("正式Room復帰は固定packageRevisionを保持し、不一致時だけ明示的な新Room置換を許可する", async () => {
  const oldRevision = "42292ad52a3bafcd751d6ba1767534d794c0c602";
  const requestedRevision = "02efe902e4ed49ea525abb862da74c123651efcb";
  const oldContract = packageRuntimeContract(oldRevision, "a".repeat(64));
  const requestedContract = packageRuntimeContract(
    requestedRevision,
    "b".repeat(64),
  );
  const store = memoryRoomStore();
  const createRuntime = (
    adapter: AuthenticatedGameSdkPlatformAdapter<
      SdkCountUpCreateInput,
      SdkCountUpCommand,
      SdkCountUpRoomView
    >,
  ) => createGameSdkHttpClientRuntime<
    SdkCountUpCreateInput,
    SdkCountUpCommand,
    SdkCountUpRoomView
  >({
    endpoint: "https://game-fields.test/api/sdk-preview/test10-1/games/link-lines/rooms",
    fetcher: httpFetcher(createGameSdkOnlineRoomHttpHandlers({
      adapter: adapter as unknown as AuthenticatedGameSdkPlatformAdapter<
        unknown,
        { type: string },
        unknown
      >,
    })),
    gameId: "sdk-count-up-proof",
  });
  const oldAdapter = createAuthenticatedGameSdkPlatformAdapter({
    module: sdkCountUpServerModule,
    roomStore: store,
    runtimeContract: oldContract,
    resolveIdentity: async () => host,
    now: () => 2_000,
    createRequestId: () => "request-old-room",
  });
  const oldRuntime = createRuntime(oldAdapter);
  const oldRoom = await oldRuntime.createRoom({
    roomCode: "30QT",
    create: {
      settings: { target: 3 },
      app: {},
    },
  });
  assert.equal(oldRoom.packageRevision, oldRevision);
  assert.equal(
    (await oldRuntime.readActiveRoom())?.packageRevision,
    oldRevision,
    "same-revision active Room restore must retain the pinned package revision",
  );

  const requestedAdapter = createAuthenticatedGameSdkPlatformAdapter({
    module: sdkCountUpServerModule,
    roomStore: store,
    runtimeContract: requestedContract,
    allowActiveRoomPackageRevisionReplacement: true,
    async resolveRuntime(contract) {
      if (contract.packageRevision !== oldRevision) return null;
      return {
        module: sdkCountUpServerModule,
        runtimeContract: oldContract,
      };
    },
    resolveIdentity: async () => host,
    now: () => 3_000,
    createRequestId: () => "request-new-room",
  });
  const requestedRuntime = createRuntime(requestedAdapter);
  const restoredFromRequestedUrl = await requestedRuntime.readActiveRoom();
  assert.equal(restoredFromRequestedUrl?.code, "30QT");
  assert.equal(
    restoredFromRequestedUrl?.packageRevision,
    oldRevision,
    "the URL-selected revision must not overwrite Room metadata",
  );
  assert.deepEqual(
    (await requestedRuntime.listRooms()).rooms,
    [],
    "a lounge must not advertise Rooms from a different package revision",
  );
  assert.equal((await oldRuntime.listRooms()).rooms[0]?.packageRevision, oldRevision);

  await assert.rejects(
    () => requestedRuntime.createRoom({
      roomCode: "NEW1",
      create: {
        settings: { target: 3 },
        app: {},
      },
    }),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 409
      && error.code === "PLAYER_ACTIVE_ROOM"
    ),
    "a mismatched active Room must not be silently replaced",
  );
  await assert.rejects(
    () => requestedRuntime.createRoom({
      roomCode: "NEW2",
      create: {
        settings: { target: 3 },
        app: {},
      },
      replaceActiveRoom: {
        code: "30QT",
        packageRevision: "c".repeat(40),
      },
    }),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 403
      && error.code === "GAME_SDK_ACTIVE_ROOM_REPLACEMENT_FORBIDDEN"
    ),
    "the replacement must be bound to the exact active Room revision",
  );

  const requestedRoom = await requestedRuntime.createRoom({
    roomCode: "NEW3",
    create: {
      settings: { target: 3 },
      app: {},
    },
    replaceActiveRoom: {
      code: "30QT",
      packageRevision: oldRevision,
    },
  });
  assert.equal(requestedRoom.packageRevision, requestedRevision);
  assert.deepEqual(
    {
      code: (await requestedRuntime.readActiveRoom())?.code,
      packageRevision: (await requestedRuntime.readActiveRoom())?.packageRevision,
    },
    {
      code: "NEW3",
      packageRevision: requestedRevision,
    },
    "explicit replacement must create and activate a Room on the URL revision",
  );
  assert.equal(
    (await requestedRuntime.readRoom("30QT"))?.packageRevision,
    oldRevision,
    "the old Room remains pinned and is never reinterpreted as the new package",
  );
});

test("Platform DEBUG bridge keeps pinned package bundles compatible", async () => {
  let identity = debugHost;
  const legacyModule = {
    ...sdkCountUpServerModule,
    async presentRoom(
      room: Readonly<SdkCountUpRoom>,
      context: Parameters<typeof sdkCountUpServerModule.presentRoom>[1],
    ) {
      const presented = await sdkCountUpServerModule.presentRoom(room, context);
      return {
        ...presented,
        common: {
          ...presented.common,
          players: presented.common.players.map((roomPlayer) => ({
            ...roomPlayer,
            isDummy: false,
          })),
          permissions: {
            ...presented.common.permissions,
            canDebug: false,
          },
        },
      };
    },
    applyCommand(
      room: SdkCountUpRoom,
      command: SdkCountUpCommand,
      context: Parameters<typeof sdkCountUpServerModule.applyCommand>[2],
    ) {
      assert.notEqual(command.type, "room/debug-auto-progress");
      assert.notEqual(command.type, "room/debug-simulate-timeout");
      assert.notEqual(command.type, "room/debug-set-connected");
      assert.notEqual(command.type, "room/debug-simulate-input-error");
      assert.notEqual(command.type, "room/debug-act-as-dummy");
      return sdkCountUpServerModule.applyCommand(room, command, context);
    },
  };
  const adapter = createAuthenticatedGameSdkPlatformAdapter({
    module: legacyModule,
    roomStore: memoryRoomStore(),
    resolveIdentity: async () => identity,
    now: (() => {
      let value = 3_000;
      return () => ++value;
    })(),
  });
  const handlers = createGameSdkOnlineRoomHttpHandlers({
    adapter: adapter as unknown as AuthenticatedGameSdkPlatformAdapter<
      unknown,
      { type: string },
      unknown
    >,
  });
  const runtime = createGameSdkHttpClientRuntime<
    SdkCountUpCreateInput,
    SdkCountUpCommand,
    SdkCountUpRoomView
  >({
    endpoint: "https://game-fields.test/api/game-sdk/sdk-count-up-proof/rooms",
    fetcher: httpFetcher(handlers),
    gameId: "sdk-count-up-proof",
  });

  let room = await runtime.createRoom({
    roomCode: "OLD1",
    create: { settings: { target: 3 }, app: {} },
  });
  room = (await runtime.sendCommand(room.code, {
    expectedRevision: room.revision,
    command: { type: "room/debug-add-dummy" },
  })).room;
  room = (await runtime.sendCommand(room.code, {
    expectedRevision: room.revision,
    command: { type: "game/start" },
  })).room;
  assert.equal(room.view.common.permissions.canDebug, true);
  assert.equal(room.view.common.players[1]?.isDummy, true);
  assert.equal(
    (
      room.view.common.permissions as typeof room.view.common.permissions & {
        canDebugActAsDummy?: boolean;
        canDebugAutoProgress?: boolean;
      }
    ).canDebugActAsDummy,
    true,
  );

  room = (await runtime.sendCommand(room.code, {
    expectedRevision: room.revision,
    command: {
      type: "room/debug-act-as-dummy",
      seat: 1,
      command: { type: "game/count-up" },
    } as unknown as SdkCountUpCommand,
  })).room;
  assert.equal(room.view.app.count, 1);
  assert.equal(room.view.app.lastActorSeat, 1);

  await assert.rejects(
    () => runtime.sendCommand(room.code, {
      expectedRevision: room.revision,
      command: {
        type: "room/debug-act-as-dummy",
        seat: 0,
        command: { type: "game/count-up" },
      } as unknown as SdkCountUpCommand,
    }),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 409
      && error.code === "DEBUG_DUMMY_REQUIRED"
    ),
  );
  await assert.rejects(
    () => runtime.sendCommand(room.code, {
      expectedRevision: room.revision,
      command: {
        type: "room/debug-act-as-dummy",
        seat: 1,
        command: { type: "room/leave" },
      } as unknown as SdkCountUpCommand,
    }),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 400
      && error.code === "GAME_SDK_INVALID_DEBUG_COMMAND"
    ),
  );
  identity = player;
  await assert.rejects(
    () => runtime.sendCommand(room.code, {
      expectedRevision: room.revision,
      command: {
        type: "room/debug-act-as-dummy",
        seat: 1,
        command: { type: "game/count-up" },
      } as unknown as SdkCountUpCommand,
    }),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 403
      && error.code === "DEBUG_ACCESS_REQUIRED"
    ),
  );
  identity = debugHost;

  room = (await runtime.sendCommand(room.code, {
    expectedRevision: room.revision,
    command: { type: "room/debug-auto-progress" },
  })).room;
  assert.equal(room.view.app.count, 2);
  assert.equal(room.view.common.players[0]?.reducedTime, false);

  const revisionBeforeRejection = room.revision;
  await assert.rejects(
    () => runtime.sendCommand(room.code, {
      expectedRevision: room.revision,
      command: { type: "room/debug-simulate-input-error" },
    }),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.code === "DEBUG_INPUT_ERROR_SIMULATED"
    ),
  );
  assert.equal((await runtime.readRoom(room.code))?.revision, revisionBeforeRejection);

  room = (await runtime.sendCommand(room.code, {
    expectedRevision: room.revision,
    command: {
      type: "room/debug-set-connected",
      seat: 1,
      connected: false,
    },
  })).room;
  assert.equal(room.view.common.players[1]?.connected, false);

  room = (await runtime.sendCommand(room.code, {
    expectedRevision: room.revision,
    command: { type: "room/debug-simulate-timeout" },
  })).room;
  assert.equal(room.phase, "result");
});

test("result outboxは保存失敗をconfirmedへ戻し、次のreadで同じeventを再開する", async () => {
  let identity = host;
  const store = memoryRoomStore();
  const observedEvents: string[] = [];
  let failures = 1;
  const adapter = createAuthenticatedGameSdkPlatformAdapter({
    module: sdkCountUpServerModule,
    roomStore: store,
    resolveIdentity: async () => identity,
    now: (() => {
      let value = 2_000;
      return () => ++value;
    })(),
    onResultConfirmed: async (result) => {
      observedEvents.push(result.eventId);
      if (failures-- > 0) throw new Error("RESULT_STORE_TEMPORARY");
    },
  });

  let room = await adapter.createRoom({
    roomCode: "OUTBOX",
    create: { settings: { target: 2 }, app: {} },
  });
  identity = player;
  room = (await adapter.sendCommand({
    code: room.code,
    envelope: {
      commandId: "outbox-join-0001",
      expectedRevision: room.revision,
      command: { type: "room/join" },
    },
  })).room;
  identity = host;
  room = (await adapter.sendCommand({
    code: room.code,
    envelope: {
      commandId: "outbox-start-001",
      expectedRevision: room.revision,
      command: { type: "game/start" },
    },
  })).room;
  room = (await adapter.sendCommand({
    code: room.code,
    envelope: {
      commandId: "outbox-count-001",
      expectedRevision: room.revision,
      command: { type: "game/count-up" },
    },
  })).room;
  await assert.rejects(
    () => adapter.sendCommand({
      code: room.code,
      envelope: {
        commandId: "outbox-count-002",
        expectedRevision: room.revision,
        command: { type: "game/count-up" },
      },
    }),
    /RESULT_STORE_TEMPORARY/,
  );

  const confirmed = await store.load(room.code);
  assert.equal(confirmed?.phase, "result");
  assert.equal(confirmed?.resultOutbox[0]?.status, "result-confirmed");
  const recovered = await adapter.readRoom(room.code);
  assert.equal(recovered?.phase, "result");
  const completed = await store.load(room.code);
  assert.equal(completed?.resultOutbox[0]?.status, "completed");
  assert.equal(observedEvents.length, 2);
  assert.equal(observedEvents[0], observedEvents[1]);
});

test("result room dissolution flushes pending result persistence before deletion", async () => {
  let identity = host;
  const store = memoryRoomStore();
  const observedEvents: string[] = [];
  let failures = 1;
  const adapter = createAuthenticatedGameSdkPlatformAdapter({
    module: sdkCountUpServerModule,
    roomStore: store,
    resolveIdentity: async () => identity,
    now: (() => {
      let value = 4_000;
      return () => ++value;
    })(),
    onResultConfirmed: async (result) => {
      observedEvents.push(result.eventId);
      if (failures-- > 0) throw new Error("RESULT_STORE_TEMPORARY");
    },
  });

  let room = await adapter.createRoom({
    roomCode: "SAFE",
    create: { settings: { target: 2 }, app: {} },
  });
  identity = player;
  room = (await adapter.sendCommand({
    code: room.code,
    envelope: {
      commandId: "safe-join-command",
      expectedRevision: room.revision,
      command: { type: "room/join" },
    },
  })).room;
  identity = host;
  for (const [commandId, command] of [
    ["safe-start-command", { type: "game/start" }],
    ["safe-count-command1", { type: "game/count-up" }],
  ] as const) {
    room = (await adapter.sendCommand({
      code: room.code,
      envelope: {
        commandId,
        expectedRevision: room.revision,
        command,
      },
    })).room;
  }
  await assert.rejects(
    () => adapter.sendCommand({
      code: room.code,
      envelope: {
        commandId: "safe-count-command2",
        expectedRevision: room.revision,
        command: { type: "game/count-up" },
      },
    }),
    /RESULT_STORE_TEMPORARY/,
  );
  assert.equal((await store.load(room.code))?.phase, "result");

  assert.equal(await adapter.dissolveRoom(room.code), true);
  assert.equal(await store.load(room.code), null);
  assert.equal(observedEvents.length, 2);
  assert.equal(observedEvents[0], observedEvents[1]);
});

test("SDK HTTP Client Runtimeは404をnull、壊れたRoom応答を契約エラーにする", async () => {
  const missing = createGameSdkHttpClientRuntime<unknown, { type: string }, unknown>({
    gameId: "missing",
    endpoint: "/api/game-sdk/missing/rooms",
    fetcher: async () => Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 }),
  });
  assert.equal(await missing.readRoom("NONE"), null);

  const invalid = createGameSdkHttpClientRuntime<unknown, { type: string }, unknown>({
    gameId: "invalid",
    endpoint: "/api/game-sdk/invalid/rooms",
    fetcher: async () => Response.json({ room: { code: "BAD" } }),
  });
  await assert.rejects(
    () => invalid.readRoom("BAD1"),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.code === "GAME_SDK_INVALID_ROOM_RESPONSE"
      && error.status === 502
    ),
  );
});

test("SDK Room watcherはrevision通知を受けてHTTPの閲覧Viewだけを再取得する", async () => {
  class FakeSocket implements GameSdkWebSocketLike {
    readyState = 1;
    sent: string[] = [];
    listeners = new Map<string, Array<(event: { data?: unknown }) => void>>();

    send(data: string) {
      this.sent.push(data);
    }

    close() {
      this.emit("close");
    }

    addEventListener(
      type: "open" | "message" | "close" | "error",
      listener: (event: { data?: unknown }) => void,
    ) {
      const listeners = this.listeners.get(type) ?? [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }

    emit(type: string, data?: unknown) {
      for (const listener of this.listeners.get(type) ?? []) listener({ data });
    }
  }

  let revision = 1;
  const socket = new FakeSocket();
  const seen: number[] = [];
  let resolveSecond!: () => void;
  const secondRoom = new Promise<void>((resolve) => {
    resolveSecond = resolve;
  });
  const runtime = createGameSdkHttpClientRuntime<unknown, { type: string }, { value: number }>({
    gameId: "sdk-count-up-proof",
    endpoint: "https://game-fields.test/api/game-sdk/sdk-count-up-proof/rooms",
    realtimeEndpoint: "https://game-fields.test/api/online-room-events",
    webSocketFactory: () => socket,
    fetcher: async (_input, init) => {
      if (init?.method === "HEAD") return new Response(null, { status: 204 });
      return Response.json({
        room: {
          code: "LONGCODE12",
          revision,
          phase: "lobby",
          view: { value: revision },
        },
      });
    },
  });
  const watch = runtime.watchRoom("longcode12", {
    onRoom(room) {
      if (!room) return;
      seen.push(room.revision);
      if (seen.length === 2) resolveSecond();
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  socket.emit("open");
  assert.deepEqual(JSON.parse(socket.sent[0] ?? "{}"), {
    type: "subscribe",
    game: "sdk:sdk-count-up-proof",
    code: "LONGCODE12",
  });
  assert.equal(socket.sent[0]?.includes("playerId"), false);
  revision = 2;
  socket.emit("message", JSON.stringify({
    type: "room-updated",
    game: "sdk:sdk-count-up-proof",
    code: "LONGCODE12",
    revision: 2,
    timestamp: 2_000,
  }));
  await secondRoom;
  assert.deepEqual(seen, [1, 2]);
  watch.close();
});

test("SDK server registryは静的に審査登録したmoduleだけを環境別に公開する", () => {
  const development = {
    ...process.env,
    VERCEL_GIT_COMMIT_REF: "develop",
  };
  const production = {
    ...process.env,
    VERCEL_GIT_COMMIT_REF: "main",
  };
  assert.deepEqual(approvedGameSdkIds(development), ["wordwolf-sdk"]);
  assert.equal(
    approvedGameSdkRegistration("wordwolf-sdk", development)?.id,
    "wordwolf-sdk",
  );
  assert.equal(approvedGameSdkRegistration("creator-upload", development), null);
  assert.deepEqual(approvedGameSdkIds(production), []);
  assert.equal(approvedGameSdkRegistration("wordwolf-sdk", production), null);
});
