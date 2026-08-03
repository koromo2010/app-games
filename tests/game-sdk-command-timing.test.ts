import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import {
  createGameSdkCommandTimingCollector,
} from "../lib/game-sdk-command-timing.ts";
import {
  gameFieldsPackageClientRuntimeSource,
} from "../apps/sdk-preview/lib/package-client-runtime.ts";

test("shared Command timing collector attributes injected delays to the exact allowlisted interval", async () => {
  let now = 0;
  const timing = createGameSdkCommandTimingCollector(() => now);
  await timing.measure("auth", async () => { now += 11; });
  await timing.measure("runtime-resolve", async () => { now += 17; });
  timing.record("runner-call", 23);
  timing.record("room-cas", 29);
  timing.record("present-room", 31);
  timing.setRequestId("raw-request-id-must-not-appear");
  timing.setCommandId("raw-room-code-player-token-must-not-appear");
  timing.setRevision(7);
  now += 5;

  const response = timing.decorate(Response.json({ ok: true }));
  const header = response.headers.get("server-timing") ?? "";
  assert.match(header, /auth;dur=11\.0/);
  assert.match(header, /runtime-resolve;dur=17\.0/);
  assert.match(header, /runner-call;dur=23\.0/);
  assert.match(header, /room-cas;dur=29\.0/);
  assert.match(header, /present-room;dur=31\.0/);
  assert.match(header, /total;dur=33\.0/);
  assert.equal(
    response.headers.get("x-game-sdk-revision"),
    "7",
  );
  assert.match(
    response.headers.get("x-game-sdk-request") ?? "",
    /^event_[A-Za-z0-9_-]{16}$/,
  );
  assert.match(
    response.headers.get("x-game-sdk-trace") ?? "",
    /^command_[A-Za-z0-9_-]{16}$/,
  );
  assert.doesNotMatch(
    [...response.headers.entries()].flat().join("\n"),
    /raw-room-code|player-token/,
  );
});

test("runner Server-Timing import rejects unapproved fields and payload-like descriptions", () => {
  const timing = createGameSdkCommandTimingCollector(() => 0);
  timing.importServerTiming(
    'quickjs-init;dur=4, bundle-eval;dur=6, room-json;dur=999;desc="secret", actor-id;dur=888',
  );
  const entries = timing.entries();
  assert.deepEqual(entries, [
    { stage: "quickjs-init", durationMs: 4, count: 1 },
    { stage: "bundle-eval", durationMs: 6, count: 1 },
  ]);
});

test("iframe completion waits for final state notification and a rendered animation frame without viewer GET", () => {
  const bridge = readFileSync(
    "app/components/game-sdk/GameSdkIframeBridge.tsx",
    "utf8",
  );
  const packageRuntime = readFileSync(
    "apps/sdk-preview/lib/package-client-runtime.ts",
    "utf8",
  );
  assert.doesNotMatch(bridge, /readRoomAsDebugViewer/);
  assert.match(bridge, /game-fields:room-state-presented/);
  assert.match(bridge, /await presented/);
  assert.match(bridge, /stateDelivered: true/);
  assert.match(packageRuntime, /notify\("room:hydrate"\)/);
  assert.match(packageRuntime, /window\.requestAnimationFrame/);
  assert.match(packageRuntime, /game-fields:room-state-presented/);
  assert.match(packageRuntime, /recordTiming\(\s*"command-resolve"/);
  assert.match(packageRuntime, /message\.stateDelivered !== true/);
});

test("injected iframe delay is attributed to receive, state, animation-frame, and Command resolution", async () => {
  type MessageListener = (event: { source: unknown; data: unknown }) => void;
  type FrameCallback = (timestamp: number) => void;
  let now = 0;
  const listeners: { message?: MessageListener } = {};
  let notifications = 0;
  const frames: FrameCallback[] = [];
  const posted: Array<Record<string, unknown>> = [];
  const measures: Array<{ name: string; duration: number }> = [];
  const parent = {
    postMessage(message: Record<string, unknown>) {
      posted.push(message);
    },
  };
  const windowObject: Record<string, unknown> = {
    parent,
    addEventListener(type: string, listener: MessageListener) {
      if (type === "message") listeners.message = listener;
    },
    dispatchEvent() {},
    requestAnimationFrame(callback: FrameCallback) {
      frames.push(callback);
      return frames.length;
    },
    setTimeout() { return 1; },
    clearTimeout() {},
  };
  runInNewContext(gameFieldsPackageClientRuntimeSource(), {
    window: windowObject,
    document: {
      readyState: "complete",
      body: { scrollHeight: 320 },
      documentElement: { scrollHeight: 320 },
      addEventListener() {},
    },
    performance: {
      now: () => now,
      measure(name: string, options: { duration: number }) {
        measures.push({ name, duration: options.duration });
      },
    },
    CustomEvent: class {},
    ResizeObserver: class {
      observe() {}
    },
  });
  const preset = windowObject.GameFieldsPreset as {
    registerGame(adapter: {
      onStateChange(state: unknown, command: string): void;
    }): void;
  };
  const room = windowObject.GameFieldsRoom as {
    send(command: { type: string }): Promise<unknown>;
  };
  preset.registerGame({
    onStateChange(_state, command) {
      if (command === "room:hydrate") {
        notifications += 1;
        now += 7;
      }
    },
  });
  frames.length = 0;
  posted.length = 0;

  now = 10;
  let resolved = false;
  const command = room.send({ type: "game/move" }).then((value) => {
    resolved = true;
    return value;
  });
  const request = posted.find((message) => (
    message.type === "game-fields:room-command"
  ));
  assert.equal(typeof request?.requestId, "string");

  const timing = {
    requestRef: "event_safeTimingRef001",
    traceRef: "command_safeTimingRef1",
    revision: 8,
  };
  now = 30;
  assert.ok(listeners.message);
  listeners.message({
    source: parent,
    data: {
      type: "game-fields:room-snapshot",
      room: { code: "SAFE", revision: 8, view: {} },
      timing,
    },
  });
  assert.equal(notifications, 1);
  assert.equal(resolved, false);
  assert.equal(frames.length, 1);

  now = 50;
  frames.shift()?.(now);
  await Promise.resolve();
  assert.equal(resolved, false, "Command must remain locked until the parent acknowledges the rendered View");
  assert.ok(posted.some((message) => (
    message.type === "game-fields:room-state-presented"
    && message.requestRef === timing.requestRef
    && message.traceRef === timing.traceRef
    && message.revision === timing.revision
  )));

  now = 55;
  listeners.message({
    source: parent,
    data: {
      type: "game-fields:room-command-result",
      requestId: request?.requestId,
      room: { code: "SAFE", revision: 8, view: {} },
      stateDelivered: true,
      timing,
    },
  });
  await command;
  assert.equal(resolved, true);
  assert.equal(notifications, 1, "the Command result must not notify the same View twice");
  assert.deepEqual(measures, [
    {
      name: "game-sdk:iframe-receive:command_safeTimingRef1:r8",
      duration: 7,
    },
    {
      name: "game-sdk:iframe-state:command_safeTimingRef1:r8",
      duration: 7,
    },
    {
      name: "game-sdk:next-animation-frame:command_safeTimingRef1:r8",
      duration: 20,
    },
    {
      name: "game-sdk:view-render:command_safeTimingRef1:r8",
      duration: 45,
    },
    {
      name: "game-sdk:command-resolve:command_safeTimingRef1:r8",
      duration: 45,
    },
  ]);
});
