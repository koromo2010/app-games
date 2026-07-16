import assert from "node:assert/strict";
import test from "node:test";
import {
  loadIndexedOnlineRoomPage,
  loadOnlineRoomValues,
  normalizeOnlineRoomListCursor,
  scanOnlineRoomCodes,
} from "../lib/online-room-list.ts";

test("部屋一覧カーソルはRedisへ渡せる数字だけを受け付ける", () => {
  assert.equal(normalizeOnlineRoomListCursor("42"), "42");
  assert.equal(normalizeOnlineRoomListCursor("-1"), "0");
  assert.equal(normalizeOnlineRoomListCursor("1 OR 1"), "0");
  assert.equal(normalizeOnlineRoomListCursor(null), "0");
});

test("部屋一覧は期限切れを処理し、欠損した索引を掃除する", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const commands: unknown[][] = [];
  const expiredLoads: string[] = [];
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    commands.push(command);
    const result = command[0] === "SSCAN"
      ? ["0", ["LIVE", "OLD1", "GONE"]]
      : command[0] === "MGET"
        ? [JSON.stringify({ updatedAt: Date.now() }), JSON.stringify({ updatedAt: 0 }), null]
        : 1;
    return new Response(JSON.stringify({ result }), { status: 200 });
  };

  try {
    const page = await loadIndexedOnlineRoomPage("0", {
      indexKey: "game:rooms",
      roomKey: (code) => `game:room:${code}`,
      parseRoom: (raw) => raw ? JSON.parse(raw) as { updatedAt: number } : null,
      loadRoom: async (code) => { expiredLoads.push(code); return null; },
    });
    assert.equal(page.rooms.length, 3);
    assert.equal(page.nextCursor, null);
    assert.deepEqual(expiredLoads, ["OLD1"]);
    assert.deepEqual(commands.at(-1), ["SREM", "game:rooms", "GONE"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});

test("部屋一覧はSSCAN 24件とMGETの2コマンドにまとめる", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const commands: unknown[][] = [];
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    commands.push(command);
    const result = command[0] === "SSCAN"
      ? ["17", ["AB12", "CD34"]]
      : [JSON.stringify({ code: "AB12" }), JSON.stringify({ code: "CD34" })];
    return new Response(JSON.stringify({ result }), { status: 200 });
  };

  try {
    const page = await scanOnlineRoomCodes("wordwolf:rooms", "0");
    const values = await loadOnlineRoomValues(page.codes, (code) => `wordwolf:room:${code}`);
    assert.deepEqual(page, { codes: ["AB12", "CD34"], nextCursor: "17" });
    assert.equal(values.length, 2);
    assert.deepEqual(commands, [
      ["SSCAN", "wordwolf:rooms", "0", "COUNT", "24"],
      ["MGET", "wordwolf:room:AB12", "wordwolf:room:CD34"],
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});
