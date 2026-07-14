import assert from "node:assert/strict";
import test from "node:test";
import { clearConditionalJsonClientCache } from "../lib/conditional-json-client.ts";
import { createOnlineRoomApiClient, OnlineRoomApiError, restoreOnlineRoom } from "../lib/online-room-api-client.ts";

type Room = { code: string; revision: number };
type Choice = { code: string };

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
    return Response.json({ rooms: [{ code: "ABCD" }] });
  };
  const client = createOnlineRoomApiClient<Room, Choice>({ endpoint: "/api/example/rooms", fetcher });

  assert.deepEqual(await client.fetchRoom("ABCD", "p1"), { code: "ABCD", revision: 2 });
  assert.deepEqual(await client.fetchActiveRoom("p1"), { code: "ACTIVE", revision: 4 });
  assert.deepEqual(await client.fetchJoinableRooms(), [{ code: "ABCD" }]);
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
