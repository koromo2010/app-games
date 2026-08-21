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

test("TOTP verification has a tighter, fail-closed admin identity budget", async () => {
  const result = await checkRateLimitCore(
    new Request("https://game-fields.com/api/admin/passkeys"),
    rateLimitPolicies.adminTotp,
    { identity: "admin@example.test" },
    async <T>(): Promise<T> => {
      throw new Error("REDIS_UNAVAILABLE");
    },
  );
  assert.equal(rateLimitPolicies.adminTotp.identity?.limit, 6);
  assert.equal(result.allowed, false);
  assert.equal(result.storeAvailable, false);
});

test("SDK Room quota combines actor, creator, package and Room buckets", async () => {
  let captured: unknown[] = [];
  const execute = async <T>(command: unknown[]) => {
    captured = command;
    return [1, 0] as T;
  };
  const result = await checkRateLimitCore(
    new Request("https://game-fields.com/api/game-sdk/test/rooms", {
      headers: { "x-forwarded-for": "203.0.113.12" },
    }),
    rateLimitPolicies.sdkRoomMutation,
    {
      playerId: "player-1",
      creatorId: "creator-1",
      packageId: "creator-1/game-1",
      roomId: "creator-1/game-1/ROOM",
      environment: "candidate-preview",
    },
    execute,
  );
  assert.equal(result.allowed, true);
  assert.equal(result.bucketCount, 5);
  assert.equal(captured[2], "5");
  assert.equal(captured.some((value) => String(value).includes("creator-1")), false);
  assert.equal(captured.some((value) => String(value).includes("ROOM")), false);
});

test("SDK Room quota fails closed when its store is unavailable", async () => {
  const result = await checkRateLimitCore(
    new Request("https://game-fields.com/api/game-sdk/test/rooms"),
    rateLimitPolicies.sdkRoomMutation,
    {
      playerId: "player-1",
      packageId: "game-1",
      roomId: "game-1/ROOM",
      environment: "test",
    },
    async <T>(): Promise<T> => {
      throw new Error("REDIS_UNAVAILABLE");
    },
  );
  assert.equal(result.allowed, false);
  assert.equal(result.storeAvailable, false);
  assert.equal(result.retryAfterMs, 1_000);
});

test("debug SDK policies are isolated and materially larger than player policies", () => {
  assert.notEqual(
    rateLimitPolicies.sdkRuntimeReadDebug.id,
    rateLimitPolicies.sdkRuntimeRead.id,
  );
  assert.notEqual(
    rateLimitPolicies.sdkRoomMutationDebug.id,
    rateLimitPolicies.sdkRoomMutation.id,
  );
  assert.equal(rateLimitPolicies.sdkRuntimeRead.player.limit, 120);
  assert.equal(rateLimitPolicies.sdkRoomMutation.player.limit, 180);
  assert.ok(
    rateLimitPolicies.sdkRuntimeReadDebug.player.limit
      >= rateLimitPolicies.sdkRuntimeRead.player.limit * 10,
  );
  assert.ok(
    rateLimitPolicies.sdkRoomMutationDebug.player.limit
      >= rateLimitPolicies.sdkRoomMutation.player.limit * 6,
  );
  assert.equal(rateLimitPolicies.sdkRoomMutationDebug.failClosed, true);
});
