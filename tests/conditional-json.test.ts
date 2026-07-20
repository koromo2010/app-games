import assert from "node:assert/strict";
import test from "node:test";
import { conditionalJsonResponse, conditionalVersionedJsonResponse } from "../lib/conditional-json.ts";
import { clearConditionalJsonClientCache, fetchConditionalJson } from "../lib/conditional-json-client.ts";

test("conditional JSON returns 304 for an unchanged authenticated view", async () => {
  const first = conditionalJsonResponse(new Request("https://game-fields.com/api/rooms"), { room: { revision: 4 } });
  const etag = first.headers.get("ETag");
  assert.equal(first.status, 200);
  assert.match(etag ?? "", /^"json-/);
  assert.equal(first.headers.get("Cache-Control"), "private, no-cache");

  const second = conditionalJsonResponse(new Request("https://game-fields.com/api/rooms", {
    headers: { "If-None-Match": etag ?? "" },
  }), { room: { revision: 4 } });
  assert.equal(second.status, 304);
  assert.equal(await second.text(), "");

  const changed = conditionalJsonResponse(new Request("https://game-fields.com/api/rooms", {
    headers: { "If-None-Match": etag ?? "" },
  }), { room: { revision: 5 } });
  assert.equal(changed.status, 200);
});

test("versioned conditional JSON skips presentation and serialization on 304", async () => {
  let presentations = 0;
  const first = conditionalVersionedJsonResponse(
    new Request("https://game-fields.com/api/rooms"),
    "room:AB12:4:player-1",
    () => { presentations += 1; return { room: { revision: 4 } }; },
  );
  const etag = first.headers.get("ETag") ?? "";
  assert.equal(first.status, 200);
  assert.equal(presentations, 1);

  const unchanged = conditionalVersionedJsonResponse(
    new Request("https://game-fields.com/api/rooms", { headers: { "If-None-Match": etag } }),
    "room:AB12:4:player-1",
    () => { presentations += 1; return { room: { revision: 4 } }; },
  );
  assert.equal(unchanged.status, 304);
  assert.equal(presentations, 1);

  const changed = conditionalVersionedJsonResponse(
    new Request("https://game-fields.com/api/rooms", { headers: { "If-None-Match": etag } }),
    "room:AB12:5:player-1",
    () => { presentations += 1; return { room: { revision: 5 } }; },
  );
  assert.equal(changed.status, 200);
  assert.equal(presentations, 2);
});

test("conditional client reuses 304 data and coalesces overlapping polls", async () => {
  clearConditionalJsonClientCache();
  let calls = 0;
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    if (calls === 1) {
      return Response.json({ room: { revision: 8 } }, { headers: { ETag: "\"room-8\"" } });
    }
    assert.equal(new Headers(init?.headers).get("If-None-Match"), "\"room-8\"");
    return new Response(null, { status: 304, headers: { ETag: "\"room-8\"" } });
  };

  const first = await fetchConditionalJson<{ room: { revision: number } }>("/api/rooms?code=ABCD", fetcher);
  assert.equal(first.data?.room.revision, 8);

  const [left, right] = await Promise.all([
    fetchConditionalJson<{ room: { revision: number } }>("/api/rooms?code=ABCD", fetcher),
    fetchConditionalJson<{ room: { revision: number } }>("/api/rooms?code=ABCD", fetcher),
  ]);
  assert.equal(calls, 2);
  assert.equal(left.notModified, true);
  assert.equal(right.data?.room.revision, 8);
});
