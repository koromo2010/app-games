import assert from "node:assert/strict";
import { test } from "node:test";
import { createGameSdkMockRuntime } from "@game-fields/game-sdk/mock-runtime";
import {
  createSdkPreviewPackageRouteHandler,
  type SdkPreviewPackageRouteTarget,
} from "../lib/sdk-preview-package-route-handler.ts";
import { sdkCountUpServerModule } from "./fixtures/sdk-count-up-game.ts";

const revision = "6".repeat(40);
const creatorSlug = "test10-1";
const gameId = "twixt-repro";
const playerId = "preview-host";
const secret = "preview-route-test-secret-that-is-long-enough-32";

const target: SdkPreviewPackageRouteTarget = {
  creatorSlug,
  gameId,
  scope: { creatorSlug, gameId, revision },
  actor: {
    playerId,
    displayName: "Preview Host",
    role: "host",
    debugAccess: true,
  },
  debugEnabled: true,
  module: sdkCountUpServerModule,
};

const route = createSdkPreviewPackageRouteHandler({
  resolveTarget: async () => target,
  createRuntime: (runtimeTarget, initialRoom) => createGameSdkMockRuntime({
    module: runtimeTarget.module as typeof sdkCountUpServerModule,
    ...(initialRoom ? { initialRooms: [initialRoom] } : {}),
    resources: {},
  }),
});

function context() {
  return {
    params: Promise.resolve({ creatorSlug, gameId }),
  };
}

function previewUrl() {
  return `https://dev.game-fields.com/api/sdk-preview/${creatorSlug}/games/${gameId}/preview?revision=${revision}`;
}

function cookieHeaderFromSetCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie, "Preview create must return Set-Cookie");
  const separator = setCookie.indexOf(";");
  assert.ok(separator > 0, "Set-Cookie must contain a cookie pair");
  return setCookie.slice(0, separator);
}

test("Preview create cookie continues into the next command request", async () => {
  const previousPlayerSecret = process.env.PLAYER_SESSION_SECRET;
  process.env.PLAYER_SESSION_SECRET = secret;
  try {
    const createdResponse = await route(
      new Request(previewUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomCode: "GF1234",
          create: { settings: { target: 3 }, app: {} },
        }),
      }),
      context(),
      "POST",
    );
    assert.equal(createdResponse.status, 200);
    const created = await createdResponse.json() as {
      room: { code: string; revision: number };
    };
    assert.equal(created.room.code, "GF1234");
    assert.equal(created.room.revision, 1);
    const cookie = cookieHeaderFromSetCookie(createdResponse);

    const nextResponse = await route(
      new Request(previewUrl(), {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          code: "GF1234",
          envelope: {
            commandId: "preview-cookie-roundtrip-0001",
            expectedRevision: created.room.revision,
            command: { type: "room/debug-add-dummy" },
          },
        }),
      }),
      context(),
      "PATCH",
    );
    assert.equal(nextResponse.status, 200);
    const next = await nextResponse.json() as {
      error?: string;
      room?: { code: string; revision: number };
      applied?: boolean;
    };
    assert.equal(next.error, undefined);
    assert.equal(next.applied, true);
    assert.equal(next.room?.code, "GF1234");
    assert.equal(next.room?.revision, 2);
  } finally {
    if (previousPlayerSecret === undefined) delete process.env.PLAYER_SESSION_SECRET;
    else process.env.PLAYER_SESSION_SECRET = previousPlayerSecret;
  }
});
