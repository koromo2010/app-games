import assert from "node:assert/strict";
import test from "node:test";
import { deleteIndexedOnlineRoomStorage } from "../lib/online-room-dissolution.ts";

test("部屋解散時の部屋・一覧・参加者索引削除を1 Redis commandにまとめる", async () => {
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
    await deleteIndexedOnlineRoomStorage({
      roomCode: "AB12",
      roomKey: "game:room:AB12",
      roomIndexKey: "game:rooms",
      playerActiveRoomKeys: ["game:active:p1", "game:active:p2", "game:active:p1"],
    });
    assert.equal(commands.length, 1);
    assert.equal(commands[0]?.[0], "EVAL");
    assert.deepEqual(commands[0]?.slice(2), ["4", "game:room:AB12", "game:rooms", "game:active:p1", "game:active:p2", "AB12"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});
