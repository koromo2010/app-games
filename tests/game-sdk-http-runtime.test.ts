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
  const store: GameSdkPlatformRoomStore<SdkCountUpRoom> = {
    async create(record) {
      if (rooms.has(record.code)) return "exists";
      rooms.set(record.code, clone(record));
      for (const playerId of playerIds(record)) activeRooms.set(playerId, record.code);
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
      for (const playerId of playerIds(record)) activeRooms.set(playerId, record.code);
      return "saved";
    },
    async claimActiveRoom(playerId, targetCode) {
      const previousCode = activeRooms.get(playerId) ?? null;
      const previous = previousCode ? rooms.get(previousCode) : null;
      if (
        previous
        && previousCode !== targetCode
        && playerIds(previous).includes(playerId)
        && previous.phase !== "result"
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
    async listRooms(_cursor, maximumPlayers) {
      return {
        rooms: [...rooms.values()]
          .filter((record) => (
            record.phase === "lobby"
            && record.room.players.length < maximumPlayers
          ))
          .map((record) => ({
            code: record.code,
            phase: record.phase,
            revision: record.revision,
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
    async dissolveHostedRooms(actorId) {
      const targets = [...rooms.values()].filter((record) => record.hostPlayerId === actorId);
      if (targets.some((record) => record.phase !== "lobby" && record.phase !== "result")) {
        throw new Error("GAME_IN_PROGRESS");
      }
      for (const record of targets) await store.dissolveRoom(record.code, actorId);
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

const player: GameFieldsAuthenticatedIdentity = {
  playerId: "player-account",
  displayName: "Player",
  debugAccess: false,
};

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
    create: { target: 3 },
  });
  assert.equal(room.code, "RACE");
  assert.deepEqual(room.view.playerNames, ["Host"]);
  assert.equal(JSON.stringify(room).includes(host.playerId), false);
  assert.equal((await runtime.readActiveRoom())?.code, "RACE");
  assert.deepEqual(await runtime.listRooms(), {
    rooms: [{
      code: "RACE",
      phase: "lobby",
      revision: 1,
      playerCount: 1,
      maximumPlayers: 4,
      updatedAt: 1_000,
    }],
    nextCursor: null,
  });
  await assert.rejects(
    () => runtime.createRoom({ roomCode: "NEXT", create: { target: 2 } }),
    (error: unknown) => (
      error instanceof GameSdkHttpClientRuntimeError
      && error.status === 409
      && error.code === "PLAYER_ACTIVE_ROOM"
    ),
  );

  identity = player;
  assert.equal(await runtime.readActiveRoom(), null);
  const beforeJoin = await runtime.readRoom("race");
  assert.equal(beforeJoin?.view.isMember, false);
  room = (await runtime.sendCommand("race", {
    expectedRevision: room.revision,
    command: {
      type: "room/join",
      playerId: "forged-account",
    } as unknown as SdkCountUpCommand,
  })).room;
  assert.deepEqual(room.view.playerNames, ["Host", "Player"]);
  assert.equal(JSON.stringify(room).includes("forged-account"), false);

  identity = host;
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "start" },
  })).room;
  assert.equal(room.phase, "playing");
  assert.deepEqual((await runtime.listRooms()).rooms, []);

  await assert.rejects(
    () => runtime.sendCommand("RACE", {
      expectedRevision: 1,
      command: { type: "count-up" },
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
    command: { type: "count-up" },
  })).room;
  identity = player;
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "count-up" },
  })).room;
  identity = host;
  room = (await runtime.sendCommand("RACE", {
    expectedRevision: room.revision,
    command: { type: "count-up" },
  })).room;
  assert.equal(room.phase, "result");
  assert.equal(await runtime.dissolveRoom("RACE"), true);
  assert.equal(await runtime.readRoom("RACE"), null);
  assert.equal(await runtime.readActiveRoom(), null);
  identity = player;
  assert.equal(await runtime.readActiveRoom(), null);
  identity = host;
  await runtime.createRoom({ roomCode: "DONE", create: { target: 2 } });
  assert.equal(await runtime.dissolveHostedRooms(), 1);
  assert.equal(await runtime.readRoom("DONE"), null);
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
