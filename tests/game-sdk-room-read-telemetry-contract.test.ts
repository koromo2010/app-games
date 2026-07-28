import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtime = readFileSync(
  "packages/game-sdk/src/client-runtime.ts",
  "utf8",
);
const realtime = readFileSync(
  "packages/game-sdk/src/client-realtime.ts",
  "utf8",
);

test("room read telemetry covers direct and watcher-driven reads", () => {
  for (const operation of [
    "read-room",
    "read-debug-viewer",
    "read-active-room",
    "list-rooms",
  ]) {
    assert.match(runtime, new RegExp(`operation: \\"${operation}\\"`));
  }
  for (const source of [
    "direct",
    "watch-initial",
    "watch-polling",
    "watch-reconciliation",
    "watch-websocket",
  ]) {
    assert.match(
      `${runtime}\n${realtime}`,
      new RegExp(`\\"${source}\\"`),
    );
  }
});

test("watch refresh reports why the authoritative room read happened", () => {
  assert.match(realtime, /refresh\("watch-initial"\)/);
  assert.match(realtime, /refresh\("watch-polling"\)/);
  assert.match(realtime, /refresh\("watch-reconciliation"\)/);
  assert.match(realtime, /refresh\("watch-websocket"\)/);
  assert.match(runtime, /readRoom: readRoomWithSource/);
});

test("telemetry is optional and cannot break room transport", () => {
  assert.match(runtime, /onRoomReadTelemetry\?\(event: GameSdkRoomReadTelemetryEvent\): void/);
  assert.match(runtime, /sink\?\.\(event\)/);
  assert.match(runtime, /Observability must never change room transport behavior/);
});

test("room read telemetry exposes anonymous performance fields only", () => {
  const eventType = runtime.match(
    /export type GameSdkRoomReadTelemetryEvent = \{([\s\S]*?)\n\};/,
  )?.[1] ?? "";
  for (const field of [
    "operationId",
    "operation",
    "source",
    "durationMs",
    "outcome",
    "statusCode",
    "errorCode",
    "revision",
    "roomCount",
  ]) {
    assert.match(eventType, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(eventType, /roomCode|playerId|playerName|displayName|actorId|viewerSeat/);
});
