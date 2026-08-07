import assert from "node:assert/strict";
import test from "node:test";
import type { GameSdkManifest } from "@game-fields/game-sdk";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import { createGameSdkRemoteServerModule } from "../lib/game-sdk-remote-module.ts";
import {
  createSdkPreviewPackageRouteHandler,
  type SdkPreviewPackageRouteTarget,
} from "../lib/sdk-preview-package-route-handler.ts";

const revision = "6".repeat(40);
const creatorSlug = "test10-1";
const gameId = "twixt-repro";
const playerId = "preview-host";
const serverRuntimeToken = "server-runtime-token-must-stay-internal";
const secret = "preview-observability-test-secret-that-is-long-enough-32";

const manifest: GameSdkManifest = {
  sdkVersion: 1,
  id: "preview-observability-test",
  title: { ja: "Observability test", en: "Observability test" },
  playMode: "online-room",
  minimumPlayers: 1,
  maximumPlayers: 2,
  supportsDebug: false,
  supportsSpectators: false,
  supportsRating: false,
  supportsReplay: false,
  usesLlm: false,
};

function room(revisionValue: number) {
  return {
    code: "GF1234",
    revision: revisionValue,
    phase: revisionValue === 1 ? "lobby" : "playing",
    hostPlayerId: playerId,
    players: [{
      id: playerId,
      displayName: "Preview Host",
      joinedAt: 1,
      connected: true,
    }],
    app: { count: revisionValue - 1 },
  };
}

function createTestRoute(outcome: string | null) {
  const runnerModule = createGameSdkRemoteServerModule({
    manifest,
    runtimeId: "preview-observability-test",
    revision,
    serverBundleSha256: "b".repeat(64),
    serverRuntimeUrl: "https://preview.example/server/preview-observability-test",
    serverRuntimeToken,
  }, async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      kind?: unknown;
      invocation?: { operation?: unknown };
      apply?: { invocation?: { operation?: unknown } };
    };
    if (body.kind === "game-fields-command-batch-v1") {
      return Response.json({
        ok: true,
        value: {
          room: room(2),
          view: { count: 1 },
        },
      }, {
        headers: {
          ...(outcome ? { "X-Game-Sdk-Artifact-Cache": outcome } : {}),
          "Server-Timing": "quickjs-init;dur=1",
        },
      });
    }
    const operation = body.invocation?.operation ?? body.apply?.invocation?.operation;
    if (operation === "createRoom") {
      return Response.json({ ok: true, value: room(1) });
    }
    return Response.json({ ok: true, value: { count: 0 } });
  });

  const target: SdkPreviewPackageRouteTarget = {
    creatorSlug,
    gameId,
    scope: { creatorSlug, gameId, revision },
    actor: {
      playerId,
      displayName: "Preview Host",
      role: "host",
      debugAccess: false,
    },
    debugEnabled: false,
    module: runnerModule,
  };

  return createSdkPreviewPackageRouteHandler({
    resolveTarget: async () => target,
    createRuntime: (runtimeTarget, initialRoom, timing) => createGameSdkMockRuntime({
      module: runtimeTarget.module as typeof runnerModule,
      ...(initialRoom ? { initialRooms: [initialRoom] } : {}),
      timing,
    }),
  });
}

function context() {
  return {
    params: Promise.resolve({ creatorSlug, gameId }),
  };
}

function url() {
  return `https://dev.game-fields.com/api/sdk-preview/${creatorSlug}/games/${gameId}/preview?revision=${revision}`;
}

function cookieHeaderFromSetCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie);
  const separator = setCookie.indexOf(";");
  assert.ok(separator > 0);
  return setCookie.slice(0, separator);
}

test("Preview Command exposes only allowlisted artifact-cache outcomes", async () => {
  const previousSecret = process.env.PLAYER_SESSION_SECRET;
  process.env.PLAYER_SESSION_SECRET = secret;
  try {
    for (const outcome of ["miss", "hit", "waiter", "bypass"]) {
      const route = createTestRoute(outcome);
      const createdResponse = await route(
        new Request(url(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roomCode: "GF1234",
            create: { app: {} },
          }),
        }),
        context(),
        "POST",
      );
      const cookie = cookieHeaderFromSetCookie(createdResponse);
      const response = await route(
        new Request(url(), {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify({
            code: "GF1234",
            envelope: {
              expectedRevision: 1,
              command: { type: "game/move" },
            },
          }),
        }),
        context(),
        "PATCH",
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-game-sdk-artifact-cache"), outcome);
      assert.match(response.headers.get("server-timing") ?? "", /quickjs-init;dur=1/);
      assert.equal(response.headers.get("x-game-sdk-revision"), "2");
      const text = await response.text();
      assert.doesNotMatch(text, /server-runtime-token-must-stay-internal/);
    }
  } finally {
    if (previousSecret === undefined) delete process.env.PLAYER_SESSION_SECRET;
    else process.env.PLAYER_SESSION_SECRET = previousSecret;
  }
});

test("Preview Command suppresses invalid or absent artifact-cache outcomes", async () => {
  const previousSecret = process.env.PLAYER_SESSION_SECRET;
  process.env.PLAYER_SESSION_SECRET = secret;
  try {
    for (const outcome of ["unexpected-secret-value", null]) {
      const route = createTestRoute(outcome);
      const createdResponse = await route(
        new Request(url(), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roomCode: "GF1234", create: { app: {} } }),
        }),
        context(),
        "POST",
      );
      const response = await route(
        new Request(url(), {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: cookieHeaderFromSetCookie(createdResponse),
          },
          body: JSON.stringify({
            code: "GF1234",
            envelope: {
              expectedRevision: 1,
              command: { type: "game/move" },
            },
          }),
        }),
        context(),
        "PATCH",
      );
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-game-sdk-artifact-cache"), null);
      assert.equal((await response.json() as { applied?: boolean }).applied, true);
    }
  } finally {
    if (previousSecret === undefined) delete process.env.PLAYER_SESSION_SECRET;
    else process.env.PLAYER_SESSION_SECRET = previousSecret;
  }
});
