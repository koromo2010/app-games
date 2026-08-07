import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decodeSdkPreviewPackageSession,
  encodeSdkPreviewPackageSession,
  sdkPreviewPackageSessionSetCookie,
} from "../lib/sdk-preview-package-session.ts";

const revision = "6".repeat(40);
const scope = {
  creatorSlug: "test10-1",
  gameId: "twixt-repro",
  revision,
};
const secret = "preview-test-secret-that-is-long-enough-32";

function source(path: string) {
  return readFileSync(path, "utf8");
}

test("package Preview selects the shared package frame without formal Room semantics", () => {
  const page = source("app/sdk-preview/[creatorSlug]/games/[gameId]/page.tsx");
  const controller = source("app/components/game-sdk/use-game-sdk-frame-controller.ts");
  const lifecycle = source("app/components/game-sdk/use-game-sdk-room-lifecycle.ts");
  const view = source("app/components/game-sdk/GameSdkFrameView.tsx");

  assert.match(page, /game\.runtimeKind === "package" && game\.revision && game\.manifest/);
  assert.match(page, /\/preview\?revision=\$\{encodeURIComponent\(game\.revision\)\}/);
  assert.doesNotMatch(page, /game\.runtimeKind === "package"[\s\S]*?&& !previewOnly/);
  assert.match(page, /previewOnly=\{previewOnly\}/);
  assert.match(lifecycle, /previewOnly \? Promise\.resolve\(null\) : runtime\.readActiveRoom/);
  assert.match(controller, /!previewOnly[\s\S]*?lifecycle\.dissolveRoom/);
  assert.match(lifecycle, /if \(!next \|\| previewOnly\) return true/);
  assert.match(view, /data-formal-room="false"/);
  assert.match(view, /Preview session内で起動します/);
});

test("Preview endpoint owns package room protocol and has no formal Room store dependency", () => {
  const route = source("app/api/sdk-preview/[creatorSlug]/games/[gameId]/preview/route.ts");
  const bridge = source("app/components/game-sdk/GameSdkIframeBridge.tsx");
  const client = source("apps/sdk-preview/lib/package-client-runtime.ts");

  assert.match(route, /createGameSdkMockRuntime/);
  assert.match(route, /runtime\.sendCommand/);
  assert.match(route, /encodeSdkPreviewPackageSession/);
  assert.doesNotMatch(route, /createGameSdkOnlineRoomHttpHandlers|createRedisGameSdk/);
  assert.match(bridge, /game-fields:room-ready/);
  assert.match(bridge, /game-fields:room-command/);
  assert.match(bridge, /game-fields:room-command-result/);
  assert.match(client, /game-fields:room-snapshot/);
  assert.match(client, /game-fields:room-command-error/);
});

test("Preview session state is encrypted, scope-bound, and browser-cookie bounded", () => {
  const session = {
    version: 1 as const,
    scope,
    playerId: "player-1",
    room: {
      code: "GF1234",
      revision: 1,
      phase: "lobby",
      players: [{
        id: "player-1",
        displayName: "Preview",
        joinedAt: 1,
        connected: true,
      }],
      app: { safe: true },
    },
  };
  const token = encodeSdkPreviewPackageSession(session, secret);
  assert.notEqual(token.includes('"safe"'), true);
  assert.deepEqual(
    decodeSdkPreviewPackageSession(token, scope, "player-1", secret),
    session,
  );
  assert.equal(
    decodeSdkPreviewPackageSession(token, { ...scope, revision: "7".repeat(40) }, "player-1", secret),
    null,
  );
  assert.match(
    sdkPreviewPackageSessionSetCookie(scope, token, false),
    /HttpOnly; SameSite=Lax; Max-Age=3600$/,
  );
});
