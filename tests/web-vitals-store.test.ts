import assert from "node:assert/strict";
import test from "node:test";
import { selectWebVitalsSession } from "../lib/web-vitals.ts";
import { recordWebVital } from "../lib/web-vitals-store.ts";

test("Web Vitalsはセッション単位で50%を抽出する", () => {
  assert.equal(selectWebVitalsSession(0), true);
  assert.equal(selectWebVitalsSession(0.4999), true);
  assert.equal(selectWebVitalsSession(0.5), false);
  assert.equal(selectWebVitalsSession(1), false);
  assert.equal(selectWebVitalsSession(Number.NaN), false);
});

test("Web Vitalsの保存と整理を1 Redis commandにまとめる", async () => {
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
    const saved = await recordWebVital({ name: "LCP", value: 1200, rating: "good", path: "/games", device: "desktop" });
    assert.equal(saved?.name, "LCP");
    assert.equal(commands.length, 1);
    assert.equal(commands[0]?.[0], "EVAL");
    assert.equal(commands[0]?.[3], "web-vitals:v1");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  }
});
