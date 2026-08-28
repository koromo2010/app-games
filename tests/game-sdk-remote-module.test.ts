import assert from "node:assert/strict";
import test from "node:test";
import type { GameSdkManifest } from "@game-fields/game-sdk";
import { createGameSdkRemoteServerModule } from "../lib/game-sdk-remote-module.ts";
import { createGameSdkCommandTimingCollector } from "../lib/game-sdk-command-timing.ts";
import type { GameSdkEffectJournal } from "../lib/game-sdk-effect-journal.ts";
import { GameSdkRunnerCircuitBreakerRegistry } from "../lib/game-sdk-runner-client.ts";
import { setObservabilitySink } from "../lib/observability/index.ts";
import { consoleObservabilitySink } from "../lib/observability/sink.ts";
import type { ObservabilityEvent } from "../lib/observability/types.ts";

const manifest: GameSdkManifest = {
  sdkVersion: 1,
  id: "runner-test",
  title: { ja: "Runner test", en: "Runner test" },
  playMode: "online-room",
  minimumPlayers: 1,
  maximumPlayers: 2,
  supportsDebug: false,
  supportsSpectators: false,
  supportsRating: false,
  supportsReplay: false,
  usesLlm: false,
};

function moduleWith(
  fetchRunner: typeof fetch,
  options: {
    effectJournal?: GameSdkEffectJournal;
    resilience?: Parameters<typeof createGameSdkRemoteServerModule>[2];
  } = {},
) {
  const resilience = {
    breakerRegistry: new GameSdkRunnerCircuitBreakerRegistry(),
    ...options.resilience,
  };
  return createGameSdkRemoteServerModule({
    manifest,
    runtimeId: "runner-test",
    revision: "a".repeat(40),
    serverBundleSha256: "b".repeat(64),
    serverRuntimeUrl: "https://preview.example/server/runner-test",
    serverRuntimeToken: "signed-token",
    effectJournal: options.effectJournal,
  }, fetchRunner, resilience);
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
    actor: { playerId: "player-1", displayName: "Player 1", role: "player", debugAccess: false },
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
    () => Promise.resolve(runnerModule.createRoom({}, {
      actor: { playerId: "player-1", displayName: "Player 1", role: "player", debugAccess: false },
      now: 1,
      requestId: "request-1",
      roomCode: "ABCD",
      resources: {},
    })),
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

test("resource-effect passes reuse the journal and never duplicate a side effect", async () => {
  const completed = new Map<string, Awaited<ReturnType<Parameters<GameSdkEffectJournal["execute"]>[1]>>>();
  let effectExecutions = 0;
  const effectJournal: GameSdkEffectJournal = {
    async execute(input, operation) {
      const key = `${input.runtimeId}:${input.packageRevision}:${input.roomCode}:${input.requestId}:${input.effect.id}`;
      const existing = completed.get(key);
      if (existing) return structuredClone(existing);
      effectExecutions += 1;
      const result = await operation();
      completed.set(key, structuredClone(result));
      return result;
    },
  };
  const requestBodies: Array<{ effects?: Record<string, unknown> }> = [];
  const runnerModule = moduleWith((async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      effects?: Record<string, unknown>;
    };
    requestBodies.push(body);
    if (!body.effects?.["effect-words-1"]) {
      return Response.json({
        ok: false,
        effect: {
          id: "effect-words-1",
          resource: "contentSource",
          operation: "drawWords",
          request: { pool: "general-words", count: 1 },
        },
      });
    }
    return Response.json({
      ok: true,
      value: { code: "EFFECT", revision: 1, phase: "lobby", state: {} },
    });
  }) as typeof fetch, { effectJournal });
  const context = {
    actor: {
      playerId: "player-effect",
      displayName: "Effect Player",
      role: "player" as const,
      debugAccess: false,
    },
    now: 1,
    requestId: "create-effect-request-0001",
    roomCode: "EFFECT",
    resources: {
      contentSource: {
        async drawWords() {
          return [];
        },
        async drawWordPairs() {
          return [];
        },
        async findDefinitions() {
          return [];
        },
      },
    },
  };

  await runnerModule.createRoom({}, context);
  await runnerModule.createRoom({}, context);

  assert.equal(requestBodies.length, 4);
  assert.equal(effectExecutions, 1);
  assert.deepEqual(requestBodies[1]?.effects, requestBodies[3]?.effects);
});

test("an unresolved effect pass stays unknown without a second effect execution", async () => {
  let effectExecutions = 0;
  let runnerCalls = 0;
  const effectJournal: GameSdkEffectJournal = {
    async execute(_input, operation) {
      effectExecutions += 1;
      return operation();
    },
  };
  const runnerModule = moduleWith((async (_url, init) => {
    runnerCalls += 1;
    const body = JSON.parse(String(init?.body)) as {
      effects?: Record<string, unknown>;
    };
    if (Object.keys(body.effects ?? {}).length === 0) {
      return Response.json({
        ok: false,
        effect: {
          id: "effect-words-timeout",
          resource: "contentSource",
          operation: "drawWords",
          request: { pool: "general-words", count: 1 },
        },
      });
    }
    return await new Promise<Response>(() => undefined);
  }) as typeof fetch, {
    effectJournal,
    resilience: {
      attemptTimeoutMs: 8,
      invocationTimeoutMs: 100,
      maxAttempts: 2,
      retryBaseDelayMs: 0,
    },
  });

  await assert.rejects(
    () => Promise.resolve(runnerModule.createRoom({}, {
      actor: {
        playerId: "player-timeout",
        displayName: "Timeout Player",
        role: "player",
        debugAccess: false,
      },
      now: 1,
      requestId: "create-effect-timeout-0001",
      roomCode: "TIMEOUT",
      resources: {
        contentSource: {
          async drawWords() {
            return [];
          },
          async drawWordPairs() {
            return [];
          },
          async findDefinitions() {
            return [];
          },
        },
      },
    })),
    /GAME_SDK_REMOTE_RUNNER_TIMEOUT/,
  );
  assert.equal(runnerCalls, 3);
  assert.equal(effectExecutions, 1);
});

test("runner observability excludes token, Room, player and prompt material", async () => {
  const events: ObservabilityEvent[] = [];
  setObservabilitySink({ emit: (event) => { events.push(event); } });
  try {
    const runnerModule = moduleWith((async () => Response.json(
      { error: "SERVER_RUNTIME_BUSY" },
      { status: 503 },
    )) as typeof fetch, {
      resilience: { maxAttempts: 1 },
    });
    await assert.rejects(
      () => Promise.resolve(runnerModule.createRoom({ prompt: "private-prompt" }, {
        actor: {
          playerId: "private-player",
          displayName: "Private Player",
          role: "player",
          debugAccess: false,
        },
        now: 1,
        requestId: "private-command",
        roomCode: "PRIVATE-ROOM",
        resources: {},
      })),
      /GAME_SDK_REMOTE_RUNNER_UNAVAILABLE/,
    );
    await Promise.resolve();
    assert.ok(events.length > 0);
    assert.doesNotMatch(
      JSON.stringify(events),
      /signed-token|PRIVATE-ROOM|private-player|Private Player|private-prompt|private-command/,
    );
  } finally {
    setObservabilitySink(consoleObservabilitySink);
  }
});
