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

test("runner dependency failure classes remain truthful 503 responses", async () => {
  const codes = [
    "GAME_SDK_REMOTE_ARTIFACT_NOT_FOUND",
    "GAME_SDK_REMOTE_ARTIFACT_SOURCE_UNAVAILABLE",
    "GAME_SDK_REMOTE_ARTIFACT_HASH_MISMATCH",
    "GAME_SDK_REMOTE_ARTIFACT_CIRCUIT_OPEN",
    "GAME_SDK_REMOTE_RUNNER_CONFIG_INVALID",
    "GAME_SDK_REMOTE_RUNNER_TIMEOUT",
    "GAME_SDK_REMOTE_OUTCOME_UNKNOWN",
    "GAME_SDK_REMOTE_RUNNER_CIRCUIT_OPEN",
  ];

  for (const code of codes) {
    const response = gameSdkOnlineRoomErrorResponse(new Error(code));
    assert.equal(response.status, 503, code);
    assert.deepEqual(await response.json(), { error: code }, code);
  }
});
