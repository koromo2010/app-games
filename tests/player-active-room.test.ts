import assert from "node:assert/strict";
import test from "node:test";
import { claimOnlineRoomForPlayer } from "../lib/player-active-room.ts";

test("進行中の別室から新しい部屋へ移動できない", async () => {
  await assert.rejects(
    claimOnlineRoomForPlayer({
      key: "game:active:player-1",
      targetCode: "NEXT",
      currentRoom: { code: "PLAY", phase: "playing" },
      gameId: "nigoichi",
      conflictError: "PLAYER_ALREADY_ACTIVE",
    }),
    /PLAYER_ALREADY_ACTIVE/,
  );
});

test("終了済みの別室を解除して新しい部屋を確保する", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const commands: unknown[][] = [];
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async (_input, init) => {
    commands.push(JSON.parse(String(init?.body)) as unknown[]);
    return new Response(JSON.stringify({ result: 1 }), { status: 200 });
  };

  try {
    const claim = await claimOnlineRoomForPlayer({
      key: "game:active:player-1",
      targetCode: "next",
      currentRoom: { code: "DONE", phase: "result" },
      gameId: "nigoichi",
      conflictError: "PLAYER_ALREADY_ACTIVE",
    });
    assert.equal(claim, "claimed");
    assert.equal(commands.length, 2);
    assert.equal(commands[0]?.[0], "EVAL");
    assert.equal(commands[0]?.at(-1), "DONE");
    assert.equal(commands[1]?.at(-2), "NEXT");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});
