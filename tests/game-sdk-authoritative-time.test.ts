import assert from "node:assert/strict";
import test from "node:test";
import {
  createGameSdkHttpClientRuntime,
  GameSdkHttpClientRuntimeError,
} from "@game-fields/game-sdk/client-runtime";
import { GameSdkTimerNotExpiredError } from "@game-fields/game-sdk/runtime";
import { gameSdkOnlineRoomErrorResponse } from "../lib/game-sdk-online-room-http.ts";

test("SDK HTTP transport observes the same server Date callback on room reads", async () => {
  const observations: Array<[string | null, number, number]> = [];
  const runtime = createGameSdkHttpClientRuntime<
    unknown,
    { type: string },
    { value: number }
  >({
    gameId: "clock-proof",
    endpoint: "/api/game-sdk/clock-proof/rooms",
    observeServerDate: (...observation) => observations.push(observation),
    fetcher: async () => Response.json({
      room: {
        code: "TIME",
        revision: 1,
        phase: "playing",
        view: { value: 1 },
      },
    }, {
      headers: { Date: "Thu, 01 Jan 1970 00:00:20 GMT" },
    }),
  });
  await runtime.readRoom("TIME");
  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.[0], "Thu, 01 Jan 1970 00:00:20 GMT");
  assert.ok((observations[0]?.[2] ?? 0) >= (observations[0]?.[1] ?? 0));
});

test("SDK early rejection preserves bounded retry and server deadline identity", async () => {
  const runtime = createGameSdkHttpClientRuntime<
    unknown,
    { type: "room/expire-timer"; turnSequence: number },
    { value: number }
  >({
    gameId: "clock-proof",
    endpoint: "/api/game-sdk/clock-proof/rooms",
    fetcher: async () => Response.json({
      error: "TIMER_NOT_EXPIRED",
      errorCode: "TIMER_NOT_EXPIRED",
      retryAfterMs: 250,
      serverDeadlineAt: 12_500,
    }, { status: 409 }),
  });
  await assert.rejects(
    runtime.sendCommand("TIME", {
      expectedRevision: 1,
      commandId: "timer:TIME:1",
      command: { type: "room/expire-timer", turnSequence: 1 },
    }),
    (error: unknown) => {
      assert.ok(error instanceof GameSdkHttpClientRuntimeError);
      assert.equal(error.code, "TIMER_NOT_EXPIRED");
      assert.equal(error.retryAfterMs, 250);
      assert.equal(error.serverDeadlineAt, 12_500);
      return true;
    },
  );
});

test("SDK HTTP error response exposes authoritative retry fields", async () => {
  const response = gameSdkOnlineRoomErrorResponse(
    new GameSdkTimerNotExpiredError(20_000, 19_250),
  );
  assert.equal(response.status, 409);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("retry-after"), "1");
  assert.deepEqual(await response.json(), {
    error: "TIMER_NOT_EXPIRED",
    errorCode: "TIMER_NOT_EXPIRED",
    retryAfterMs: 750,
    serverDeadlineAt: 20_000,
  });
});
