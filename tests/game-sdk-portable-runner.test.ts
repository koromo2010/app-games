import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import {
  GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
  type GameSdkPortableServerRequest,
} from "../packages/game-sdk/src/portable-server.ts";
import { runGameSdkPortableServer } from "../apps/sdk-preview/lib/server-runner.ts";

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
