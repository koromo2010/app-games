import assert from "node:assert/strict";
import test from "node:test";
import type { GameSdkManifest } from "@game-fields/game-sdk";
import { createGameSdkRemoteServerModule } from "../lib/game-sdk-remote-module.ts";

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
