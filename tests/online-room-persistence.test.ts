import assert from "node:assert/strict";
import test from "node:test";
import { compareAndSetOnlineRoom, createIndexedOnlineRoom, mutateOnlineRoomWithRetry } from "../lib/online-room-persistence.ts";

test("部屋CASと新規作成は共通Redis契約を使う", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const commands: unknown[][] = [];
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    commands.push(command);
    return new Response(JSON.stringify({ result: 1 }), { status: 200 });
  };

  try {
    const room = { code: "AB12", revision: 3 };
    assert.equal(await compareAndSetOnlineRoom(2, room, (code) => `game:room:${code}`), 1);
    await createIndexedOnlineRoom(room, { roomKey: (code) => `game:room:${code}`, roomIndexKey: "game:rooms", conflictError: "ROOM_CONFLICT" });
    assert.equal(commands[0]?.[0], "EVAL");
    assert.equal(commands.length, 2);
    assert.deepEqual(commands[1]?.slice(0, 5), ["EVAL", commands[1]?.[1], "2", "game:room:AB12", "game:rooms"]);
    assert.equal(commands[1]?.at(-3), JSON.stringify(room));
    assert.equal(commands[1]?.at(-1), "AB12");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});

test("CAS競合時は最新部屋へCommandを再適用する", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  let casAttempts = 0;
  let loads = 0;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async () => new Response(JSON.stringify({ result: ++casAttempts === 1 ? 0 : 1 }), { status: 200 });

  try {
    const saved = await mutateOnlineRoomWithRetry({
      code: "AB12",
      roomKey: (code) => `game:room:${code}`,
      loadRoom: async () => ({ code: "AB12", revision: ++loads, updatedAt: 1, count: loads }),
      mutate: (room) => ({ ...room, count: room.count + 1 }),
      normalize: (room) => room as { code: string; revision: number; updatedAt: number; count: number },
      errors: { notFound: "NOT_FOUND", invalid: "INVALID", conflict: "CONFLICT" },
    });
    assert.equal(loads, 2);
    assert.equal(saved.revision, 3);
    assert.equal(saved.count, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});

test("非同期Commandの結果もCASへ保存する", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async () => new Response(JSON.stringify({ result: 1 }), { status: 200 });

  try {
    const saved = await mutateOnlineRoomWithRetry({
      code: "AB12",
      roomKey: (code) => `game:room:${code}`,
      loadRoom: async () => ({ code: "AB12", revision: 1, updatedAt: 1, count: 1 }),
      mutate: async (room) => ({ ...room, count: room.count + 1 }),
      normalize: (room) => room as { code: string; revision: number; updatedAt: number; count: number },
      errors: { notFound: "NOT_FOUND", invalid: "INVALID", conflict: "CONFLICT" },
    });
    assert.equal(saved.revision, 2);
    assert.equal(saved.count, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});
