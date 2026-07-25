import assert from "node:assert/strict";
import test from "node:test";
import {
  createRedisGameSdkEffectJournal,
} from "../lib/game-sdk-effect-journal.ts";

function installRedisHarness() {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.UPSTASH_REDIS_REST_URL;
  const originalToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const values = new Map<string, string>();
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = async (_input, init) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    const name = String(command[0] ?? "").toUpperCase();
    if (name === "SET") {
      const key = String(command[1]);
      if (values.has(key) && command.includes("NX")) {
        return Response.json({ result: null });
      }
      values.set(key, String(command[2]));
      return Response.json({ result: "OK" });
    }
    if (name === "GET") {
      return Response.json({
        result: values.get(String(command[1])) ?? null,
      });
    }
    if (name === "EVAL") {
      const key = String(command[3]);
      const claimToken = String(command[4]);
      const completed = String(command[5]);
      const currentRaw = values.get(key);
      if (!currentRaw) return Response.json({ result: -1 });
      const current = JSON.parse(currentRaw) as {
        status?: unknown;
        claimToken?: unknown;
      };
      if (
        current.status !== "pending"
        || current.claimToken !== claimToken
      ) return Response.json({ result: 0 });
      values.set(key, completed);
      return Response.json({ result: 1 });
    }
    throw new Error(`Unexpected Redis command: ${JSON.stringify(command)}`);
  };
  return {
    restore() {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
      else process.env.UPSTASH_REDIS_REST_URL = originalUrl;
      if (originalToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
      else process.env.UPSTASH_REDIS_REST_TOKEN = originalToken;
    },
  };
}

test("effect journal stores one durable result and never reruns the operation", async () => {
  const harness = installRedisHarness();
  try {
    const journal = createRedisGameSdkEffectJournal();
    const input = {
      runtimeId: "fixture",
      packageRevision: "a".repeat(40),
      roomCode: "ROOM",
      requestId: "command-0001",
      effect: {
        id: "effect-1",
        resource: "llm" as const,
        operation: "generate" as const,
        request: { prompt: "hello" },
      },
    };
    let calls = 0;
    const operation = async () => {
      calls += 1;
      return { ok: true as const, value: { text: "world" } };
    };
    const first = await journal.execute(input, operation);
    const duplicate = await journal.execute(input, operation);
    assert.deepEqual(duplicate, first);
    assert.equal(calls, 1);
    await assert.rejects(
      () => journal.execute({
        ...input,
        effect: {
          ...input.effect,
          request: { prompt: "different" },
        },
      }, operation),
      /GAME_SDK_EFFECT_ID_CONFLICT/,
    );
    assert.equal(calls, 1);
  } finally {
    harness.restore();
  }
});
