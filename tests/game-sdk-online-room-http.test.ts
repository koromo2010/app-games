import assert from "node:assert/strict";
import test from "node:test";
import {
  gameSdkOnlineRoomErrorResponse,
} from "../lib/game-sdk-online-room-http.ts";

test("remote runner outages are reported as unavailable instead of command conflicts", async () => {
  const response = gameSdkOnlineRoomErrorResponse(
    new Error("GAME_SDK_REMOTE_RUNNER_UNAVAILABLE"),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "GAME_SDK_REMOTE_RUNNER_UNAVAILABLE",
  });
});

test("remote runner authentication failures remain distinct from transient outages", async () => {
  const response = gameSdkOnlineRoomErrorResponse(
    new Error("GAME_SDK_REMOTE_RUNNER_AUTH_FAILED"),
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "GAME_SDK_REMOTE_RUNNER_AUTH_FAILED",
  });
});
