import assert from "node:assert/strict";
import test from "node:test";
import { schedulePostResponseWork } from "../lib/post-response-work.ts";
import { redisCommand } from "../lib/redis-store.ts";
import {
  emitObservabilityEvent,
  setObservabilitySink,
} from "../lib/observability/index.ts";
import {
  consoleObservabilitySink,
} from "../lib/observability/sink.ts";
import type {
  ObservabilityEvent,
} from "../lib/observability/types.ts";

test("critical persistence failure is reported and propagated", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const events: ObservabilityEvent[] = [];
  let calls = 0;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  };
  setObservabilitySink({ emit: (event) => { events.push(event); } });

  try {
    await assert.rejects(
      schedulePostResponseWork(
        "critical-room-state-write",
        () => redisCommand(["SET", "private-room-key", "private-room-value"]),
      ),
      /REDIS_STORE_REQUEST_FAILED_503/,
    );
    assert.equal(calls, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.event, "post-response-work");
    assert.equal(events[0]?.fields.workClass, "critical");
    assert.equal(events[0]?.fields.storageOperation, "write");
    assert.equal(events[0]?.fields.storageTransport, "rest");
    assert.equal(events[0]?.fields.storageCommand, "SET");
    assert.equal(events[0]?.fields.commandCount, 1);
    assert.ok((events[0]?.fields.serializedBytes ?? 0) > 0);
    assert.equal(
      JSON.stringify(events[0]).includes("private-room"),
      false,
    );
  } finally {
    setObservabilitySink(consoleObservabilitySink);
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL;
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    }
    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }
  }
});

test("telemetry persistence failure has a structured fallback and no unhandled rejection", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const originalConsoleError = console.error;
  const errors: string[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => unhandled.push(error);
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async () => new Response(
    "unavailable",
    { status: 503 },
  );
  console.error = (...values: unknown[]) => {
    errors.push(values.map(String).join(" "));
  };
  process.on("unhandledRejection", onUnhandled);
  setObservabilitySink(consoleObservabilitySink);

  try {
    emitObservabilityEvent("error", "test.background-failure", {
      workClass: "best-effort",
      outcome: "failed",
      errorCode: "TEST_BACKGROUND_FAILURE",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(unhandled.length, 0);
    const fallback = errors
      .map((line) => JSON.parse(line) as ObservabilityEvent)
      .find((event) => event.event === "observability.sink-failure");
    assert.ok(fallback);
    assert.equal(fallback.fields.operation, "admin-issue-store");
    assert.equal(fallback.fields.storageOperation, "write");
    assert.equal(fallback.fields.storageTransport, "rest");
    assert.equal(fallback.fields.commandCount, 1);
    const serialized = JSON.stringify(fallback);
    assert.equal(serialized.includes("redis.example.test"), false);
    assert.equal(serialized.includes("test-token"), false);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) {
      delete process.env.UPSTASH_REDIS_REST_URL;
    } else {
      process.env.UPSTASH_REDIS_REST_URL = originalUrl;
    }
    if (originalToken === undefined) {
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    } else {
      process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    }
  }
});
