import assert from "node:assert/strict";
import test from "node:test";
import { clearConditionalJsonClientCache } from "../lib/conditional-json-client.ts";
import { createOnlineRoomApiClient, OnlineRoomApiError, restoreOnlineRoom } from "../lib/online-room-api-client.ts";

type Room = { code: string; revision: number };
type Choice = { code: string; roomGenerationId: string; updatedAt: number };

test("共通部屋APIクライアントが閲覧者付き取得・一覧・Commandを同じ契約で送る", async () => {
  clearConditionalJsonClientCache();
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    requests.push({ url, method, body });
    if (method === "POST") return Response.json({ room: { code: "NEW1", revision: 1 } });
    if (method === "PATCH") return Response.json({ room: { code: "ABCD", revision: 3 } });
    if (url.includes("code=ABCD")) return Response.json({ room: { code: "ABCD", revision: 2 } });
    if (url.includes("playerId=p1")) return Response.json({ room: { code: "ACTIVE", revision: 4 } });
    return Response.json({
      rooms: [{ code: "ABCD", roomGenerationId: "generation-abcd", updatedAt: 1 }],
      nextCursor: null,
    });
  };
  const client = createOnlineRoomApiClient<Room, Choice>({ endpoint: "/api/example/rooms", fetcher });

  assert.deepEqual(await client.fetchRoom("ABCD", "p1"), { code: "ABCD", revision: 2 });
  assert.deepEqual(await client.fetchActiveRoom("p1"), { code: "ACTIVE", revision: 4 });
  assert.deepEqual(await client.fetchJoinableRooms(), [{
    code: "ABCD",
    roomGenerationId: "generation-abcd",
    updatedAt: 1,
  }]);
  assert.deepEqual(await client.post({ room: { code: "NEW1", revision: 1 } }), { room: { code: "NEW1", revision: 1 } });
  assert.deepEqual(await client.patch("ABCD", { type: "start", actorId: "p1" }), { code: "ABCD", revision: 3 });
  assert.equal(requests[0].url, "/api/example/rooms?code=ABCD&playerId=p1");
  assert.deepEqual(requests.at(-1), {
    url: "/api/example/rooms",
    method: "PATCH",
    body: { code: "ABCD", action: { type: "start", actorId: "p1" } },
  });
  assert.deepEqual(requests.at(-2), {
    url: "/api/example/rooms",
    method: "POST",
    body: { room: { code: "NEW1", revision: 1 } },
  });
});

test("共通部屋APIはopaque cursorをterminalまで継続しgeneration identityでdedupeする", async () => {
  const requests: string[] = [];
  const actions: unknown[] = [];
  const client = createOnlineRoomApiClient<Room, Choice>({
    endpoint: "/api/example/rooms",
    fetcher: async (input, init) => {
      const url = String(input);
      requests.push(url);
      if (init?.method === "PATCH") {
        actions.push(JSON.parse(String(init.body)));
        return Response.json({ room: { code: "LATE", revision: 2 } });
      }
      if (url.includes("cursor=opaque-a")) return Response.json({
        rooms: [
          { code: "LATE", roomGenerationId: "generation-late", updatedAt: 3 },
          { code: "REUSED", roomGenerationId: "generation-new", updatedAt: 2 },
        ],
        nextCursor: null,
      });
      return Response.json({
        rooms: [
          { code: "OLD", roomGenerationId: "generation-late", updatedAt: 1 },
          { code: "REUSED", roomGenerationId: "generation-old", updatedAt: 1 },
        ],
        nextCursor: "opaque-a",
      });
    },
  });

  const rooms = await client.fetchJoinableRooms();
  assert.deepEqual(requests.slice(0, 2), [
    "/api/example/rooms",
    "/api/example/rooms?cursor=opaque-a",
  ]);
  assert.deepEqual(rooms.map((room) => [room.code, room.roomGenerationId]), [
    ["LATE", "generation-late"],
    ["REUSED", "generation-new"],
    ["REUSED", "generation-old"],
  ]);

  await client.patch("LATE", { type: "join-room" });
  assert.deepEqual(actions, [{
    code: "LATE",
    action: { type: "join-room" },
    expectedRoomInstanceId: "generation-late",
  }]);
});

test("共通部屋APIは非終端ページを空確定せず、malformed responseをfail-closedする", async () => {
  const client = createOnlineRoomApiClient<Room, Choice>({
    endpoint: "/api/example/rooms",
    fetcher: async () => Response.json({ rooms: [] }),
  });
  await assert.rejects(
    () => client.fetchJoinableRooms(),
    /ROOM_LIST_RESPONSE_INVALID/,
  );
});

test("共通部屋APIは後発取得で旧cursor traversalを失効させる", async () => {
  let requestCount = 0;
  const client = createOnlineRoomApiClient<Room, Choice>({
    endpoint: "/api/example/rooms",
    fetcher: async (_input, init) => {
      requestCount += 1;
      if (requestCount === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        });
      }
      return Response.json({ rooms: [], nextCursor: null });
    },
  });

  const superseded = assert.rejects(
    () => client.fetchJoinableRooms(),
    (error: unknown) => error instanceof DOMException && error.name === "AbortError",
  );
  await Promise.resolve();
  assert.deepEqual(await client.fetchJoinableRooms(), []);
  await superseded;
});

test("共通部屋APIは同一codeの複数generationを曖昧な対象としてjoinをfail-closedする", async () => {
  const client = createOnlineRoomApiClient<Room, Choice>({
    endpoint: "/api/example/rooms",
    fetcher: async () => Response.json({
      rooms: [
        { code: "REUSED", roomGenerationId: "generation-old", updatedAt: 1 },
        { code: "REUSED", roomGenerationId: "generation-new", updatedAt: 2 },
      ],
      nextCursor: null,
    }),
  });
  await client.fetchJoinableRooms();
  await assert.rejects(
    () => client.patch("REUSED", { type: "join-room" }),
    /ROOM_LIST_IDENTITY_AMBIGUOUS/,
  );
});

test("共通部屋APIエラーはHTTP statusとサーバーpayloadを保持する", async () => {
  const client = createOnlineRoomApiClient<Room, Choice>({
    endpoint: "/api/error/rooms",
    fetcher: async () => Response.json({ error: "stale revision" }, { status: 409 }),
  });
  await assert.rejects(
    () => client.patch("ABCD", { type: "start" }),
    (error: unknown) => error instanceof OnlineRoomApiError
      && error.status === 409
      && (error.payload as { error?: string }).error === "stale revision",
  );
});

test("共通部屋APIはauthoritative timer retry identityを保持する", async () => {
  const client = createOnlineRoomApiClient<Room, Choice>({
    endpoint: "/api/error/rooms",
    fetcher: async () => Response.json({
      error: "DAIFUGO_TIMER_NOT_EXPIRED",
      errorCode: "DAIFUGO_TIMER_NOT_EXPIRED",
      retryAfterMs: 125,
      serverDeadlineAt: 5_000,
    }, { status: 409 }),
  });
  await assert.rejects(
    () => client.patch("ABCD", { type: "expire-turn" }),
    (error: unknown) => error instanceof OnlineRoomApiError
      && error.code === "DAIFUGO_TIMER_NOT_EXPIRED"
      && error.retryAfterMs === 125
      && error.serverDeadlineAt === 5_000,
  );
});

test("部屋復帰はサーバーのactive roomを優先し、なければ前回コードを使う", async () => {
  const active = await restoreOnlineRoom({
    playerId: "p1",
    lastCode: "OLD1",
    fetchActiveRoom: async () => ({ code: "LIVE", revision: 5 }),
    fetchRoom: async () => ({ code: "OLD1", revision: 1 }),
  });
  assert.equal(active?.code, "LIVE");

  const previous = await restoreOnlineRoom({
    playerId: "p1",
    lastCode: "OLD1",
    fetchActiveRoom: async () => null,
    fetchRoom: async (code) => ({ code, revision: 1 }),
  });
  assert.equal(previous?.code, "OLD1");
});
