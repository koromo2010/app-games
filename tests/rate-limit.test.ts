import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimitCore, rateLimitPolicies, rateLimitResponse } from "../lib/rate-limit-core.ts";

test("rate limit combines opaque IP and player buckets in one Redis script", async () => {
  let captured: unknown[] = [];
  const execute = async <T>(command: unknown[]) => {
    captured = command;
    return [1, 0] as T;
  };
  const request = new Request("https://game-fields.com/api/test", {
    headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
  });

  const result = await checkRateLimitCore(
    request,
    rateLimitPolicies.roomMutation,
    { playerId: "raw-player-id" },
    execute,
  );

  assert.equal(result.allowed, true);
  assert.equal(result.bucketCount, 2);
  assert.equal(captured[0], "EVAL");
  assert.equal(captured[2], "2");
  assert.equal(captured.some((value) => String(value).includes("203.0.113.10")), false);
  assert.equal(captured.some((value) => String(value).includes("raw-player-id")), false);
});

test("rate limit returns the Redis retry delay", async () => {
  const execute = async <T>() => [0, 42_500] as T;
  const result = await checkRateLimitCore(
    new Request("https://game-fields.com/api/test"),
    rateLimitPolicies.auth,
    { identity: "test1" },
    execute,
  );

  assert.equal(result.allowed, false);
  assert.equal(result.retryAfterMs, 42_500);
  const response = rateLimitResponse(result);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "43");
});

test("rate limiting fails open when its Redis check is unavailable", async () => {
  const execute = async <T>(): Promise<T> => {
    throw new Error("REDIS_STORE_REQUEST_FAILED_503");
  };
  const result = await checkRateLimitCore(
    new Request("https://game-fields.com/api/test"),
    rateLimitPolicies.avatarUpload,
    { playerId: "player-1" },
    execute,
  );

  assert.equal(result.allowed, true);
  assert.equal(result.storeAvailable, false);
});
