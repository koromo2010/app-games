import assert from "node:assert/strict";
import test from "node:test";
import { canvasBackgroundPollMs, canvasLobbyActiveSyncMs, canvasLobbyForegroundPollMs, canvasPollInterval, canvasRoomForegroundPollMs } from "../lib/canvas-sync-policy.ts";

test("共同キャンバスは広場より細かく同期し、非表示タブでは通信を抑える", () => {
  assert.equal(canvasRoomForegroundPollMs, 500);
  assert.equal(canvasLobbyForegroundPollMs, 2_000);
  assert.equal(canvasBackgroundPollMs, 10_000);
  assert.equal(canvasPollInterval("room", false), canvasRoomForegroundPollMs);
  assert.equal(canvasPollInterval("lobby", false), canvasLobbyForegroundPollMs);
  assert.equal(canvasPollInterval("room", true), canvasBackgroundPollMs);
  assert.equal(canvasPollInterval("lobby", true), canvasBackgroundPollMs);
  assert.ok(canvasRoomForegroundPollMs < canvasLobbyForegroundPollMs);
  assert.ok(canvasLobbyForegroundPollMs < canvasBackgroundPollMs);
  assert.equal(canvasLobbyActiveSyncMs, 30_000);
});
