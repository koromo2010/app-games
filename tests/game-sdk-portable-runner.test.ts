import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import {
  GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
  type GameSdkPortableCommandBatchRequest,
  type GameSdkPortableServerRequest,
} from "../packages/game-sdk/src/portable-server.ts";
import {
  GameSdkPortableRunnerError,
  gameSdkPortableRunnerHttpStatus,
  runGameSdkPortableCommandBatch,
  runGameSdkPortableServer,
} from "../apps/sdk-preview/lib/server-runner.ts";

async function fixtureBundle() {
  const result = await build({
    absWorkingDir: process.cwd(),
    bundle: true,
    entryPoints: ["tests/fixtures/portable-game-entry.ts"],
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  return result.outputFiles[0]?.text ?? "";
}

function request(
  invocation: GameSdkPortableServerRequest["invocation"],
  effects?: GameSdkPortableServerRequest["effects"],
): GameSdkPortableServerRequest {
  return {
    version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
    invocation,
    ...(effects ? { effects } : {}),
  };
}

test("portable SDK bundle runs without host process or network globals", async () => {
  const bundle = [
    "globalThis.GameFieldsServerBundle={",
    "protocolVersion:1,",
    "async invoke(){return JSON.stringify({ok:true,value:{",
    "process:typeof process,fetch:typeof fetch,require:typeof require",
    "}})}};",
  ].join("");
  const result = await runGameSdkPortableServer({
    bundle,
    request: request({ operation: "manifest" }),
  });
  assert.deepEqual(result, {
    ok: true,
    value: {
      process: "undefined",
      fetch: "undefined",
      require: "undefined",
    },
  });
});

test("portable AppSet requests a platform effect and resumes unchanged", async () => {
  const bundle = await fixtureBundle();
  const room = {
    code: "ABCD",
    revision: 1,
    phase: "lobby",
    hostPlayerId: "player-1",
    word: null,
  };
  const first = await runGameSdkPortableServer({
    bundle,
    request: request({
      operation: "applyCommand",
      input: {
        room,
        command: { type: "draw" },
        context: {
          actor: {
            playerId: "player-1",
            displayName: "Player",
            role: "host",
            debugAccess: false,
          },
          now: 1_000,
          requestId: "request-1",
        },
      },
    }),
  });
  assert.equal(first.ok, false);
  assert.ok("effect" in first);
  assert.equal(first.effect.resource, "contentSource");
  assert.equal(first.effect.operation, "drawWords");

  const second = await runGameSdkPortableServer({
    bundle,
    request: request({
      operation: "applyCommand",
      input: {
        room,
        command: { type: "draw" },
        context: {
          actor: {
            playerId: "player-1",
            displayName: "Player",
            role: "host",
            debugAccess: false,
          },
          now: 1_000,
          requestId: "request-1",
        },
      },
    }, {
      [first.effect.id]: {
        ok: true,
        value: [{
          id: "word-1",
          surface: "ことば",
          difficulty: "normal",
        }],
      },
    }),
  });
  assert.deepEqual(second, {
    ok: true,
    value: {
      ...room,
      revision: 2,
      phase: "playing",
      word: "ことば",
    },
  });
});

test("existing protocol-v1 bundle batches apply and final presentation in one isolated runner", async () => {
  const bundle = await fixtureBundle();
  const room = {
    code: "BATCH",
    revision: 1,
    phase: "lobby",
    hostPlayerId: "player-1",
    word: null,
  };
  const effectRequest = {
    pool: "general-words",
    count: 1,
    difficulty: "normal",
  };
  const effectId = `contentSource:drawWords:${JSON.stringify(effectRequest)}`;
  const batch: GameSdkPortableCommandBatchRequest = {
    kind: "game-fields-command-batch-v1",
    apply: request({
      operation: "applyCommand",
      input: {
        room,
        command: { type: "draw" },
        context: {
          actor: {
            playerId: "player-1",
            displayName: "Player",
            role: "host",
            debugAccess: false,
          },
          now: 1_000,
          requestId: "batch-request-1",
        },
      },
    }, {
      [effectId]: {
        ok: true,
        value: [{
          id: "word-1",
          surface: "ことば",
          difficulty: "normal",
        }],
      },
    }) as GameSdkPortableCommandBatchRequest["apply"],
    presentationContext: {
      viewer: {
        playerId: "player-1",
        role: "host",
        debugAccess: false,
      },
      now: 1_000,
    },
  };
  const counts = new Map<string, number>();
  const result = await runGameSdkPortableCommandBatch({
    bundle,
    request: batch,
    timing: {
      record(stage) {
        counts.set(stage, (counts.get(stage) ?? 0) + 1);
      },
    },
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      room: {
        ...room,
        revision: 2,
        phase: "playing",
        word: "ことば",
      },
      view: {
        phase: "playing",
        hasWord: true,
      },
    },
  });
  assert.equal(counts.get("quickjs-init"), 1);
  assert.equal(counts.get("bundle-eval"), 1);
  assert.equal(counts.get("apply-command"), 1);
  assert.equal(counts.get("present-room"), 1);
});

test("guest interrupted text is not treated as a deadline timeout", async () => {
  const bundle = "globalThis.GameFieldsServerBundle={async invoke(){throw new Error('interrupted by guest')}};";
  await assert.rejects(
    runGameSdkPortableServer({ bundle, request: request({ operation: "manifest" }) }),
    (error: unknown) => error instanceof GameSdkPortableRunnerError && error.code === "INVALID_BUNDLE",
  );
  assert.equal(gameSdkPortableRunnerHttpStatus("INVALID_BUNDLE"), 422);
});

test("actual QuickJS deadline interruption maps to execution limit and 408", async () => {
  const bundle = "globalThis.GameFieldsServerBundle={async invoke(){while(true){}}};";
  await assert.rejects(
    runGameSdkPortableServer({ bundle, request: request({ operation: "manifest" }) }),
    (error: unknown) => error instanceof GameSdkPortableRunnerError && error.code === "EXECUTION_LIMIT",
  );
  assert.equal(gameSdkPortableRunnerHttpStatus("EXECUTION_LIMIT"), 408);
});

test("a timed-out session is disposed before the next valid invocation", async () => {
  const timeoutBundle = "globalThis.GameFieldsServerBundle={async invoke(){while(true){}}};";
  await assert.rejects(
    runGameSdkPortableServer({ bundle: timeoutBundle, request: request({ operation: "manifest" }) }),
    (error: unknown) => error instanceof GameSdkPortableRunnerError && error.code === "EXECUTION_LIMIT",
  );
  const validBundle = "globalThis.GameFieldsServerBundle={async invoke(){return JSON.stringify({ok:true,value:{alive:true}})}};";
  const result = await runGameSdkPortableServer({
    bundle: validBundle,
    request: request({ operation: "manifest" }),
  });
  assert.deepEqual(result, { ok: true, value: { alive: true } });
});
