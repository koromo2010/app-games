import assert from "node:assert/strict";
import test from "node:test";
import {
  GameFieldsPlatformRuntimeError,
  type GameFieldsAuthenticatedIdentity,
} from "@game-fields/game-runtime";
import {
  createAuthenticatedGameSdkPlatformAdapter,
  createRedisGameSdkPlatformPersistence,
  gameSdkPlatformRoomKey,
  normalizeGameSdkPlatformRoomCode,
} from "../lib/game-sdk-platform-adapter.ts";
import {
  sdkCountUpServerModule,
  type SdkCountUpCommand,
  type SdkCountUpRoom,
} from "./fixtures/sdk-count-up-game.ts";

type RedisHarness = {
  rooms: Map<string, string>;
  waitForConcurrentReadsAtRevision(revision: number): void;
  restore(): void;
};

function installRedisHarness(): RedisHarness {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const rooms = new Map<string, string>();
  let barrierRevision: number | null = null;
  let waitingReads = 0;
  let releaseBarrier = () => {};
  let barrier = Promise.resolve();

  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";

  globalThis.fetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    const name = String(command[0] ?? "").toUpperCase();
    if (name === "GET") {
      const raw = rooms.get(String(command[1])) ?? null;
      if (raw && barrierRevision !== null && JSON.parse(raw).revision === barrierRevision) {
        waitingReads += 1;
        if (waitingReads === 2) releaseBarrier();
        await barrier;
      }
      return new Response(JSON.stringify({ result: raw }), { status: 200 });
    }
    if (name === "EVAL") {
      const script = String(command[1] ?? "");
      const keyCount = Number(command[2]);
      const keys = command.slice(3, 3 + keyCount).map(String);
      const args = command.slice(3 + keyCount).map(String);
      const roomKey = keys[0];
      if (!roomKey) return new Response(JSON.stringify({ result: 0 }), { status: 200 });
      if (script.includes("EXISTS")) {
        if (rooms.has(roomKey)) return new Response(JSON.stringify({ result: 0 }), { status: 200 });
        rooms.set(roomKey, args[0] ?? "");
        return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      }
      if (script.includes("current.revision")) {
        const current = rooms.get(roomKey);
        if (!current) return new Response(JSON.stringify({ result: -1 }), { status: 200 });
        if (Number(JSON.parse(current).revision) !== Number(args[0])) {
          return new Response(JSON.stringify({ result: 0 }), { status: 200 });
        }
        rooms.set(roomKey, args[1] ?? "");
        return new Response(JSON.stringify({ result: 1 }), { status: 200 });
      }
    }
    throw new Error(`Unexpected Redis command: ${JSON.stringify(command)}`);
  };

  return {
    rooms,
    waitForConcurrentReadsAtRevision(revision) {
      barrierRevision = revision;
      waitingReads = 0;
      barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
    },
    restore() {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    },
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

test("platform adapterは認証identityを注入し、Redis CASで小規模ゲームを進行する", async () => {
  const harness = installRedisHarness();
  let identity = host;
  let now = 1_000;
  const adapter = createAuthenticatedGameSdkPlatformAdapter({
    module: sdkCountUpServerModule,
    persistence: createRedisGameSdkPlatformPersistence<SdkCountUpRoom>(sdkCountUpServerModule.manifest.id),
    resolveIdentity: async () => identity,
    now: () => ++now,
    createRequestId: () => `request-${now}`,
  });

  try {
    const created = await adapter.createRoom({ roomCode: "race", create: { target: 3 } });
    assert.equal(created.code, "RACE");
    assert.equal(created.revision, 1);
    assert.deepEqual(created.view.playerNames, ["Host"]);
    assert.equal(JSON.stringify(created).includes(host.playerId), false);

    identity = player;
    const beforeJoin = await adapter.readRoom("race");
    assert.equal(beforeJoin?.view.isMember, false);
    const joinCommand = { type: "room/join", playerId: "forged-account" } as unknown as SdkCountUpCommand;
    const joined = await adapter.sendCommand({
      code: "race",
      envelope: { expectedRevision: 1, command: joinCommand },
    });
    assert.deepEqual(joined.room.view.playerNames, ["Host", "Player"]);

    identity = host;
    const started = await adapter.sendCommand({
      code: "RACE",
      envelope: { expectedRevision: 2, command: { type: "start" } },
    });
    assert.equal(started.room.phase, "playing");
    assert.equal(started.revision, 3);

    harness.waitForConcurrentReadsAtRevision(3);
    identity = host;
    const first = adapter.sendCommand({
      code: "RACE",
      envelope: { expectedRevision: 3, command: { type: "count-up" } },
    });
    identity = player;
    const second = adapter.sendCommand({
      code: "RACE",
      envelope: { expectedRevision: 3, command: { type: "count-up" } },
    });
    const results = await Promise.allSettled([first, second]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.equal(
      rejected?.status === "rejected" && rejected.reason instanceof GameFieldsPlatformRuntimeError
        ? rejected.reason.code
        : null,
      "STALE_REVISION",
    );

    const storedRaw = harness.rooms.get(gameSdkPlatformRoomKey(sdkCountUpServerModule.manifest.id, "RACE"));
    const stored = JSON.parse(storedRaw ?? "null") as { revision?: number; room?: { lastActorPlayerId?: string } };
    assert.equal(stored.revision, 4);
    assert.ok([host.playerId, player.playerId].includes(stored.room?.lastActorPlayerId ?? ""));

    identity = player;
    const safeView = await adapter.readRoom("RACE");
    assert.equal(JSON.stringify(safeView).includes("lastActorPlayerId"), false);
    assert.equal(JSON.stringify(safeView).includes(host.playerId), false);
    assert.equal(JSON.stringify(safeView).includes(player.playerId), false);
  } finally {
    harness.restore();
  }
});

test("platform adapterのAPIはactorを受け取らず、認証失敗時は永続化しない", async () => {
  let persistenceCalls = 0;
  const adapter = createAuthenticatedGameSdkPlatformAdapter({
    module: sdkCountUpServerModule,
    persistence: {
      async create() { persistenceCalls += 1; return "created"; },
      async load() { persistenceCalls += 1; return null; },
      async compareAndSet() { persistenceCalls += 1; return "saved"; },
    },
    resolveIdentity: async () => { throw new Error("PLAYER_AUTH_REQUIRED"); },
  });

  await assert.rejects(
    () => adapter.createRoom({ roomCode: "AUTH", create: { target: 3 } }),
    /PLAYER_AUTH_REQUIRED/,
  );
  assert.equal(persistenceCalls, 0);
});

test("platform room codeは固定長の英数字へ正規化する", () => {
  assert.equal(normalizeGameSdkPlatformRoomCode(" ab12 "), "AB12");
  assert.throws(() => normalizeGameSdkPlatformRoomCode("bad:key"), /GAME_SDK_INVALID_ROOM_CODE/);
  assert.throws(() => normalizeGameSdkPlatformRoomCode("abc"), /GAME_SDK_INVALID_ROOM_CODE/);
});
