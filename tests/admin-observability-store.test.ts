import assert from "node:assert/strict";
import test from "node:test";
import { recordAdminIssue } from "../lib/admin-observability-store.ts";

test("運営向け障害記録の保存と整理を1 Redis commandにまとめる", async () => {
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
    await recordAdminIssue({
      schemaVersion: 1,
      occurredAt: "2026-07-20T00:00:00.000Z",
      level: "error",
      event: "room.read",
      service: "app-games-web",
      environment: "test",
      route: "/api/test",
      fields: { errorCode: "TEST_ERROR", statusCode: 500 },
    });
    assert.equal(commands.length, 1);
    assert.equal(commands[0]?.[0], "EVAL");
    assert.equal(commands[0]?.[3], "admin-observability-issues:v1");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});
