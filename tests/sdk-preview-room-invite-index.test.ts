import assert from "node:assert/strict";
import test from "node:test";
import {
  scheduleSdkPreviewRoomInviteIndexSuccess,
} from "../lib/sdk-preview-room-invite-index.ts";
import { multiplayerRoomTtlSeconds } from "../lib/multiplayer-room-lifecycle.ts";
import { setObservabilitySink } from "../lib/observability/index.ts";
import {
  consoleObservabilitySink,
} from "../lib/observability/sink.ts";
import type {
  ObservabilityEvent,
} from "../lib/observability/types.ts";

const revision = "a".repeat(40);

function installRedisHarness(
  response: () => Response = () => new Response(
    JSON.stringify({ result: "OK" }),
    { status: 200 },
  ),
) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const commands: unknown[][] = [];
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async (_input, init) => {
    commands.push(JSON.parse(String(init?.body)) as unknown[]);
    return response();
  };
  return {
    commands,
    restore() {
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
    },
  };
}

function successInput() {
  return {
    requestedRoomCode: "ROOM1",
    creatorSlug: "creator-safe",
    gameId: "game-safe",
    fallbackRevision: revision,
  };
}

test("GET variants never write the SDK Preview invite index", async () => {
  const harness = installRedisHarness();
  try {
    for (const operation of [
      "read",
      "debug-view",
      "active",
      "list",
    ] as const) {
      await scheduleSdkPreviewRoomInviteIndexSuccess({
        ...successInput(),
        operation,
        room: { code: "ROOM1", packageRevision: revision },
      });
    }
    assert.equal(harness.commands.length, 0);
  } finally {
    harness.restore();
  }
});

test("POST and applied PATCH write the invite index exactly once each", async () => {
  const harness = installRedisHarness();
  try {
    await scheduleSdkPreviewRoomInviteIndexSuccess({
      ...successInput(),
      operation: "create",
      room: { code: "ROOM1", packageRevision: revision },
    });
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.commands[0]?.[0], "SET");
    assert.deepEqual(
      harness.commands[0]?.slice(-2),
      ["EX", String(multiplayerRoomTtlSeconds)],
    );

    harness.commands.length = 0;
    await scheduleSdkPreviewRoomInviteIndexSuccess({
      ...successInput(),
      operation: "command",
      commandApplied: true,
      room: { code: "ROOM1", packageRevision: revision },
    });
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.commands[0]?.[0], "SET");
    assert.deepEqual(
      harness.commands[0]?.slice(-2),
      ["EX", String(multiplayerRoomTtlSeconds)],
    );
  } finally {
    harness.restore();
  }
});

test("idempotent PATCH does not extend the invite index beyond the Room TTL", async () => {
  const harness = installRedisHarness();
  try {
    await scheduleSdkPreviewRoomInviteIndexSuccess({
      ...successInput(),
      operation: "command",
      commandApplied: false,
      room: { code: "ROOM1", packageRevision: revision },
    });
    assert.equal(harness.commands.length, 0);
  } finally {
    harness.restore();
  }
});

test("an actual single-Room dissolution deletes the invite index exactly once", async () => {
  const harness = installRedisHarness(
    () => new Response(JSON.stringify({ result: 1 }), { status: 200 }),
  );
  try {
    await scheduleSdkPreviewRoomInviteIndexSuccess({
      ...successInput(),
      operation: "dissolve",
      affected: 1,
    });
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.commands[0]?.[0], "DEL");

    harness.commands.length = 0;
    await scheduleSdkPreviewRoomInviteIndexSuccess({
      ...successInput(),
      operation: "dissolve",
      affected: 0,
    });
    assert.equal(harness.commands.length, 0);
  } finally {
    harness.restore();
  }
});

test("best-effort invite write failure is structured and never rejects", async () => {
  const events: ObservabilityEvent[] = [];
  const unhandled: unknown[] = [];
  const onUnhandled = (error: unknown) => unhandled.push(error);
  const harness = installRedisHarness(
    () => new Response("unavailable", { status: 503 }),
  );
  process.on("unhandledRejection", onUnhandled);
  setObservabilitySink({ emit: (event) => events.push(event) });
  try {
    await scheduleSdkPreviewRoomInviteIndexSuccess({
      ...successInput(),
      operation: "create",
      room: { code: "ROOM1", packageRevision: revision },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(harness.commands.length, 1);
    assert.equal(unhandled.length, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.event, "game-sdk.preview-room-invite-index");
    assert.deepEqual(events[0]?.fields, {
      action: "save",
      channel: "candidate-preview",
      workClass: "best-effort",
      eventRef: events[0]?.fields.eventRef,
      storageOperation: "write",
      storageTransport: "rest",
      storageCommand: "SET",
      commandCount: 1,
      serializedBytes: events[0]?.fields.serializedBytes,
      outcome: "failed",
      errorCode: "REDIS_STORE_REQUEST_FAILED_503",
    });
    assert.match(events[0]?.fields.eventRef ?? "", /^event_/);
    assert.ok((events[0]?.fields.serializedBytes ?? 0) > 0);
    const serializedEvent = JSON.stringify(events[0]);
    for (const forbidden of [
      "ROOM1",
      "creator-safe",
      "game-safe",
      "redis.example.test",
      "test-token",
      revision,
      "sdk-preview-room-invite:",
    ]) {
      assert.equal(serializedEvent.includes(forbidden), false);
    }
  } finally {
    setObservabilitySink(consoleObservabilitySink);
    process.off("unhandledRejection", onUnhandled);
    harness.restore();
  }
});
