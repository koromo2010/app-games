import assert from "node:assert/strict";
import test from "node:test";
import {
  loadFilteredIndexedOnlineRoomPage,
  loadIndexedOnlineRoomPage,
  loadOnlineRoomValues,
  normalizeOnlineRoomListCursor,
  scanOnlineRoomCodes,
} from "../lib/online-room-list.ts";

test("部屋一覧カーソルはRedisへ渡せる数字だけを受け付ける", () => {
  assert.equal(normalizeOnlineRoomListCursor("42"), "42");
  assert.throws(() => normalizeOnlineRoomListCursor("-1"), /ONLINE_ROOM_LIST_CURSOR_INVALID/);
  assert.throws(() => normalizeOnlineRoomListCursor("1 OR 1"), /ONLINE_ROOM_LIST_CURSOR_INVALID/);
  assert.equal(normalizeOnlineRoomListCursor(null), "0");
});

async function withRedisResponses<T>(
  responder: (command: unknown[]) => unknown,
  run: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async (_input, init) => Response.json({
    result: responder(JSON.parse(String(init?.body)) as unknown[]),
  });
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
}

type SyntheticRoom = {
  code: string;
  roomGenerationId: string;
  joinable: boolean;
  updatedAt: number;
};

const parseSyntheticRoom = (raw: string | null) => (
  raw ? JSON.parse(raw) as SyntheticRoom : null
);

test("論理ページは24件超を走査し、全件filteredの先頭ページより後のRoomへ到達する", async () => {
  const firstPage = Array.from({ length: 24 }, (_, index) => ({
    code: `FILTERED-${index}`,
    roomGenerationId: `filtered-generation-${index}`,
    joinable: false,
    updatedAt: 1,
  }));
  const laterRoom = {
    code: "JOINABLE-LATER",
    roomGenerationId: "joinable-generation",
    joinable: true,
    updatedAt: 2,
  };
  const rooms = new Map([...firstPage, laterRoom].map((room) => [room.code, room]));

  await withRedisResponses((command) => {
    if (command[0] === "SSCAN") {
      return command[2] === "0"
        ? ["1", firstPage.map((room) => room.code)]
        : ["0", [laterRoom.code]];
    }
    if (command[0] === "MGET") {
      return command.slice(1).map((key) => {
        const code = String(key).replace("synthetic:room:", "");
        return JSON.stringify(rooms.get(code));
      });
    }
    return 0;
  }, async () => {
    const page = await loadFilteredIndexedOnlineRoomPage("0", {
      indexKey: "synthetic:rooms",
      roomKey: (code) => `synthetic:room:${code}`,
      parseRoom: parseSyntheticRoom,
      loadRoom: async () => null,
      selectRoom: (room) => room.joinable ? room : null,
      identity: (room) => room.roomGenerationId,
    });
    assert.deepEqual(page.rooms.map((room) => room.code), ["JOINABLE-LATER"]);
    assert.equal(page.nextCursor, null);
  });
});

test("論理ページはscan上限時のexact continuation cursorを返す", async () => {
  const scanned: string[] = [];
  await withRedisResponses((command) => {
    if (command[0] === "SSCAN") {
      scanned.push(String(command[2]));
      return command[2] === "0" ? ["17", []] : ["29", []];
    }
    return [];
  }, async () => {
    const page = await loadFilteredIndexedOnlineRoomPage("0", {
      indexKey: "synthetic:rooms",
      roomKey: (code) => `synthetic:room:${code}`,
      parseRoom: parseSyntheticRoom,
      loadRoom: async () => null,
      selectRoom: (room) => room,
      identity: (room) => room.roomGenerationId,
      maximumScanPages: 2,
    });
    assert.deepEqual(scanned, ["0", "17"]);
    assert.deepEqual(page, { rooms: [], nextCursor: "29" });
  });
});

test("論理ページはimmutable generationで重複排除する", async () => {
  const old = { code: "OLD", roomGenerationId: "same-generation", joinable: true, updatedAt: 1 };
  const duplicate = { code: "NEW", roomGenerationId: "same-generation", joinable: true, updatedAt: 2 };
  const unique = { code: "UNIQUE", roomGenerationId: "unique-generation", joinable: true, updatedAt: 3 };
  const byCode = new Map([old, duplicate, unique].map((room) => [room.code, room]));
  await withRedisResponses((command) => {
    if (command[0] === "SSCAN") return command[2] === "0"
      ? ["1", [old.code]]
      : ["0", [duplicate.code, unique.code]];
    if (command[0] === "MGET") return command.slice(1).map((key) => JSON.stringify(
      byCode.get(String(key).replace("synthetic:room:", "")),
    ));
    return 0;
  }, async () => {
    const page = await loadFilteredIndexedOnlineRoomPage("0", {
      indexKey: "synthetic:rooms",
      roomKey: (code) => `synthetic:room:${code}`,
      parseRoom: parseSyntheticRoom,
      loadRoom: async () => null,
      selectRoom: (room) => room,
      identity: (room) => room.roomGenerationId,
      pageSize: 2,
    });
    assert.deepEqual(page.rooms.map((room) => room.code), ["OLD", "UNIQUE"]);
    assert.equal(page.nextCursor, null);
  });
});

test("論理ページはmalformed・stalled・cyclic cursorをfail-closedする", async () => {
  await withRedisResponses((command) => command[0] === "SSCAN" ? ["bad", []] : [], async () => {
    await assert.rejects(
      () => loadFilteredIndexedOnlineRoomPage("0", {
        indexKey: "synthetic:rooms",
        roomKey: (code) => `synthetic:room:${code}`,
        parseRoom: parseSyntheticRoom,
        loadRoom: async () => null,
        selectRoom: (room) => room,
        identity: (room) => room.roomGenerationId,
      }),
      /ONLINE_ROOM_LIST_CURSOR_INVALID/,
    );
  });

  await withRedisResponses((command) => command[0] === "SSCAN" ? [String(command[2]), []] : [], async () => {
    await assert.rejects(
      () => loadFilteredIndexedOnlineRoomPage("7", {
        indexKey: "synthetic:rooms",
        roomKey: (code) => `synthetic:room:${code}`,
        parseRoom: parseSyntheticRoom,
        loadRoom: async () => null,
        selectRoom: (room) => room,
        identity: (room) => room.roomGenerationId,
      }),
      /ONLINE_ROOM_LIST_CURSOR_STALLED/,
    );
  });

  await withRedisResponses((command) => command[0] === "SSCAN"
    ? [command[2] === "1" ? "2" : "1", []]
    : [], async () => {
    await assert.rejects(
      () => loadFilteredIndexedOnlineRoomPage("1", {
        indexKey: "synthetic:rooms",
        roomKey: (code) => `synthetic:room:${code}`,
        parseRoom: parseSyntheticRoom,
        loadRoom: async () => null,
        selectRoom: (room) => room,
        identity: (room) => room.roomGenerationId,
      }),
      /ONLINE_ROOM_LIST_CURSOR_CYCLIC/,
    );
  });
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
