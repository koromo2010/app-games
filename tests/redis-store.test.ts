import assert from "node:assert/strict";
import test from "node:test";
import {
  getRedisRequestTimeoutMs,
  redisCommand,
  redisPipeline,
  redisStoreObservabilityFields,
} from "../lib/redis-store.ts";

function setRedisTestEnvironment() {
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  return () => {
    if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
  };
}

test("Redisタイムアウト設定を安全な範囲へ制限する", () => {
  const original = process.env.REDIS_REQUEST_TIMEOUT_MS;
  try {
    process.env.REDIS_REQUEST_TIMEOUT_MS = "200";
    assert.equal(getRedisRequestTimeoutMs(), 1_000);
    process.env.REDIS_REQUEST_TIMEOUT_MS = "5000";
    assert.equal(getRedisRequestTimeoutMs(), 5_000);
    process.env.REDIS_REQUEST_TIMEOUT_MS = "30000";
    assert.equal(getRedisRequestTimeoutMs(), 10_000);
    process.env.REDIS_REQUEST_TIMEOUT_MS = "invalid";
    assert.equal(getRedisRequestTimeoutMs(), 4_000);
  } finally {
    if (original === undefined) delete process.env.REDIS_REQUEST_TIMEOUT_MS;
    else process.env.REDIS_REQUEST_TIMEOUT_MS = original;
  }
});

test("安全なRedis読み取りだけ一時エラー後に1回再試行する", async () => {
  const restoreEnvironment = setRedisTestEnvironment();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response("unavailable", { status: 503 });
    return new Response(JSON.stringify({ result: "value" }), { status: 200 });
  };
  try {
    assert.equal(await redisCommand<string>(["GET", "key"]), "value");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("Redis read failure records safe read and transport metadata", async () => {
  const restoreEnvironment = setRedisTestEnvironment();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let observed: unknown;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  };
  try {
    await assert.rejects(
      redisCommand(["GET", "private-read-key"]).catch((error) => {
        observed = error;
        throw error;
      }),
      /REDIS_STORE_REQUEST_FAILED_503/,
    );
    assert.equal(calls, 2);
    const fields = redisStoreObservabilityFields(observed);
    assert.equal(fields.storageOperation, "read");
    assert.equal(fields.storageTransport, "rest");
    assert.equal(fields.storageCommand, "GET");
    assert.equal(fields.commandCount, 1);
    assert.ok((fields.serializedBytes ?? 0) > 0);
    assert.equal(JSON.stringify(fields).includes("private"), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("Redis書き込みは一時エラーでも自動再実行しない", async () => {
  const restoreEnvironment = setRedisTestEnvironment();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  };
  try {
    let observed: unknown;
    await assert.rejects(
      redisCommand(["SET", "key", "value"]).catch((error) => {
        observed = error;
        throw error;
      }),
      /REDIS_STORE_REQUEST_FAILED_503/,
    );
    assert.equal(calls, 1);
    const fields = redisStoreObservabilityFields(observed);
    assert.equal(fields.storageOperation, "write");
    assert.equal(fields.storageTransport, "rest");
    assert.equal(fields.storageCommand, "SET");
    assert.equal(fields.commandCount, 1);
    assert.ok((fields.serializedBytes ?? 0) > 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("Redis pipeline failure records only fixed safe operation metadata", async () => {
  const restoreEnvironment = setRedisTestEnvironment();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let observed: unknown;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  };
  try {
    await assert.rejects(
      redisPipeline([
        ["GET", "private-read-key"],
        ["SET", "private-write-key", "private-value"],
      ]).catch((error) => {
        observed = error;
        throw error;
      }),
      /REDIS_STORE_REQUEST_FAILED_503/,
    );
    assert.equal(calls, 1);
    const fields = redisStoreObservabilityFields(observed);
    assert.deepEqual(fields, {
      storageOperation: "pipeline",
      storageTransport: "rest",
      storageCommand: "MULTIPLE",
      commandCount: 2,
      serializedBytes: fields.serializedBytes,
    });
    assert.ok((fields.serializedBytes ?? 0) > 0);
    assert.equal(JSON.stringify(fields).includes("private"), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
  }
});

test("Redisプロバイダーのリクエスト上限超過を識別する", async () => {
  const restoreEnvironment = setRedisTestEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "ERR max daily request limit exceeded" }), { status: 400 });
  try {
    await assert.rejects(redisCommand(["GET", "key"]), /REDIS_STORE_REQUEST_LIMIT_EXCEEDED/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment();
  }
});
