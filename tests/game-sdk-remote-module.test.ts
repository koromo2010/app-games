import assert from "node:assert/strict";
import test from "node:test";
import type { GameSdkManifest } from "@game-fields/game-sdk";
import { createGameSdkRemoteServerModule } from "../lib/game-sdk-remote-module.ts";
import { createGameSdkCommandTimingCollector } from "../lib/game-sdk-command-timing.ts";

const manifest: GameSdkManifest = {
  id: "runner-test",
  title: "Runner test",
  minimumPlayers: 1,
  maximumPlayers: 2,
  supportsOnlineRoom: true,
  supportsRating: false,
  supportsReplay: false,
};

function moduleWith(fetchRunner: typeof fetch) {
  return createGameSdkRemoteServerModule({
    manifest,
    runtimeId: "runner-test",
    revision: "a".repeat(40),
    serverBundleSha256: "b".repeat(64),
    serverRuntimeUrl: "https://preview.example/server/runner-test",
    serverRuntimeToken: "signed-token",
  }, fetchRunner);
}

test("remote runner retries one transient response before succeeding", async () => {
  let attempts = 0;
  const runnerModule = moduleWith(async () => {
    attempts += 1;
    if (attempts === 1) {
      return Response.json({ error: "temporarily_unavailable" }, { status: 503 });
    }
    return Response.json({
      ok: true,
      value: {
        code: "ABCD",
        revision: 0,
        phase: "lobby",
        state: {},
      },
    });
  });

  const room = await runnerModule.createRoom({}, {
    actor: { id: "player-1", name: "Player 1" },
    now: 1,
    requestId: "request-1",
    roomCode: "ABCD",
    resources: {},
  });

  assert.equal(attempts, 2);
  assert.equal(room.code, "ABCD");
});

test("remote runner does not retry an authentication failure", async () => {
  let attempts = 0;
  const runnerModule = moduleWith(async () => {
    attempts += 1;
    return Response.json({ error: "forbidden" }, { status: 403 });
  });

  await assert.rejects(
    () => runnerModule.createRoom({}, {
      actor: { id: "player-1", name: "Player 1" },
      now: 1,
      requestId: "request-1",
      roomCode: "ABCD",
      resources: {},
    }),
    /GAME_SDK_REMOTE_RUNNER_AUTH_FAILED/,
  );
  assert.equal(attempts, 1);
});

test("remote Command batch uses one runner HTTP call and keeps guest operations protocol-v1", async () => {
  const requests: unknown[] = [];
  const runnerModule = moduleWith(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      kind?: unknown;
      apply?: { version?: unknown; invocation?: { operation?: unknown } };
    };
    requests.push(body);
    return Response.json({
      ok: true,
      value: {
        room: { code: "BATCH", revision: 2, phase: "playing" },
        view: { phase: "playing", viewer: "spectator" },
      },
    });
  });
  assert.ok(runnerModule.applyCommandAndPresent);
  const result = await runnerModule.applyCommandAndPresent(
    { code: "BATCH", revision: 1, phase: "lobby" },
    { type: "game/start" },
    {
      actor: {
        playerId: "host-player",
        displayName: "Host",
        role: "host",
        debugAccess: true,
      },
      now: 1_000,
      requestId: "batch-command-0001",
      resources: {},
    },
    {
      viewer: {
        playerId: null,
        role: "spectator",
        debugAccess: true,
      },
      now: 1_000,
      resources: {},
    },
  );

  assert.deepEqual(result, {
    room: { code: "BATCH", revision: 2, phase: "playing" },
    view: { phase: "playing", viewer: "spectator" },
  });
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    kind: "game-fields-command-batch-v1",
    apply: {
      version: 1,
      invocation: {
        operation: "applyCommand",
        input: {
          room: { code: "BATCH", revision: 1, phase: "lobby" },
          command: { type: "game/start" },
          context: {
            actor: {
              playerId: "host-player",
              displayName: "Host",
              role: "host",
              debugAccess: true,
            },
            now: 1_000,
            requestId: "batch-command-0001",
          },
        },
      },
      effects: {},
    },
    presentationContext: {
      viewer: {
        playerId: null,
        role: "spectator",
        debugAccess: true,
      },
      now: 1_000,
    },
  });
});

test("remote Command batch propagates only opaque request and command correlation headers", async () => {
  let receivedHeaders: Headers | undefined;
  const runnerModule = moduleWith(async (_input, init) => {
    receivedHeaders = new Headers(init?.headers);
    return Response.json({
      ok: true,
      value: {
        room: { code: "TRACE", revision: 2, phase: "playing" },
        view: { phase: "playing" },
      },
    });
  });
  const timing = createGameSdkCommandTimingCollector(() => 0);
  timing.setRequestId("request-id-with-secrets-that-must-not-cross");
  timing.setCommandId("command-id-with-room-code-and-token");
  await runnerModule.applyCommandAndPresent?.(
    { code: "TRACE", revision: 1, phase: "playing" },
    { type: "game/move" },
    {
      actor: {
        playerId: "host-player",
        displayName: "Host",
        role: "host",
        debugAccess: true,
      },
      now: 1_000,
      requestId: "command-id-with-room-code-and-token",
      resources: {},
    },
    {
      viewer: {
        playerId: "host-player",
        role: "host",
        debugAccess: true,
      },
      now: 1_000,
      resources: {},
    },
    timing,
  );

  assert.match(receivedHeaders?.get("x-game-sdk-request") ?? "", /^event_[A-Za-z0-9_-]{16}$/);
  assert.match(receivedHeaders?.get("x-game-sdk-trace") ?? "", /^command_[A-Za-z0-9_-]{16}$/);
  assert.doesNotMatch(
    [...(receivedHeaders?.entries() ?? [])].flat().join("\n"),
    /request-id-with-secrets|command-id-with-room-code-and-token/,
  );
});

test("an injected runner delay and runner-owned stages stay attributed to the runner", async () => {
  const originalPerformance = globalThis.performance;
  let now = 0;
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => now },
  });
  try {
    const runnerModule = moduleWith(async () => {
      now += 23;
      return Response.json({
        ok: true,
        value: {
          room: { code: "BATCH", revision: 2, phase: "playing" },
          view: { phase: "playing" },
        },
      }, {
        headers: {
          "Server-Timing": "quickjs-init;dur=5, bundle-eval;dur=7",
        },
      });
    });
    assert.ok(runnerModule.applyCommandAndPresent);
    const timing = createGameSdkCommandTimingCollector(() => now);
    await runnerModule.applyCommandAndPresent(
      { code: "BATCH", revision: 1, phase: "playing" },
      { type: "game/move" },
      {
        actor: {
          playerId: "host-player",
          displayName: "Host",
          role: "host",
          debugAccess: true,
        },
        now: 1_000,
        requestId: "batch-command-delay1",
        resources: {},
      },
      {
        viewer: {
          playerId: "host-player",
          role: "host",
          debugAccess: true,
        },
        now: 1_000,
        resources: {},
      },
      timing,
    );

    assert.deepEqual(timing.entries(), [
      { stage: "runner-call", durationMs: 23, count: 1 },
      { stage: "quickjs-init", durationMs: 5, count: 1 },
      { stage: "bundle-eval", durationMs: 7, count: 1 },
    ]);
  } finally {
    Object.defineProperty(globalThis, "performance", {
      configurable: true,
      value: originalPerformance,
    });
  }
});
