import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameSdkHttpClientRuntime,
  GameSdkHttpClientRuntimeError,
} from "@game-fields/game-sdk/client-runtime";
import type {
  GameFieldsAuthenticatedIdentity,
  GameFieldsPlatformRoomPersistence,
  GameFieldsPlatformRoomRecord,
} from "@game-fields/game-runtime";
import {
  createAuthenticatedGameSdkPlatformAdapter,
  type AuthenticatedGameSdkPlatformAdapter,
} from "../lib/game-sdk-platform-adapter.ts";
import { createGameSdkOnlineRoomHttpHandlers } from "../lib/game-sdk-online-room-http.ts";
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

function memoryPersistence(): GameFieldsPlatformRoomPersistence<SdkCountUpRoom> {
  const rooms = new Map<string, GameFieldsPlatformRoomRecord<SdkCountUpRoom>>();
  return {
    async create(record) {
      if (rooms.has(record.code)) return "exists";
      rooms.set(record.code, structuredClone(record));
      return "created";
    },
    async load(code) {
      const room = rooms.get(code);
      return room ? structuredClone(room) : null;
    },
    async compareAndSet(expectedRevision, record) {
      const current = rooms.get(record.code);
      if (!current) return "missing";
      if (current.revision !== expectedRevision) return "conflict";
      rooms.set(record.code, structuredClone(record));
      return "saved";
    },
  };
}

function httpFetcher(
  handlers: ReturnType<typeof createGameSdkOnlineRoomHttpHandlers>,
) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "GET") return handlers.GET(request);
    if (request.method === "POST") return handlers.POST(request);
    if (request.method === "PATCH") return handlers.PATCH(request);
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
    persistence: memoryPersistence(),
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
  });

  let room = await runtime.createRoom({
    roomCode: "race",
    create: { target: 3 },
  });
  assert.equal(room.code, "RACE");
  assert.deepEqual(room.view.playerNames, ["Host"]);
  assert.equal(JSON.stringify(room).includes(host.playerId), false);

  identity = player;
  const beforeJoin = await runtime.readRoom("race");
  assert.equal(beforeJoin?.view.isMember, false);
  room = (await runtime.sendCommand("race", {
    expectedRevision: room.revision,
    command: {
      type: "join",
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
});

test("SDK HTTP Client Runtimeは404をnull、壊れたRoom応答を契約エラーにする", async () => {
  const missing = createGameSdkHttpClientRuntime<unknown, { type: string }, unknown>({
    endpoint: "/api/game-sdk/missing/rooms",
    fetcher: async () => Response.json({ error: "ROOM_NOT_FOUND" }, { status: 404 }),
  });
  assert.equal(await missing.readRoom("NONE"), null);

  const invalid = createGameSdkHttpClientRuntime<unknown, { type: string }, unknown>({
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
