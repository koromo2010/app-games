import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decodeSdkPreviewPackageSession,
  encodeSdkPreviewPackageSession,
  readSdkPreviewPackageSession,
  sdkPreviewPackageSessionCookieName,
  sdkPreviewPackageSessionSetCookie,
} from "../lib/sdk-preview-package-session.ts";

const revision = "6".repeat(40);
const scope = {
  creatorSlug: "test10-1",
  gameId: "twixt-repro",
  revision,
};
const secret = "preview-test-secret-that-is-long-enough-32";
const now = 1_000;

function source(path: string) {
  return readFileSync(path, "utf8");
}

function cookieHeaderFromSetCookie(setCookie: string) {
  const separator = setCookie.indexOf(";");
  assert.ok(separator > 0, "Set-Cookie must contain a cookie pair");
  return setCookie.slice(0, separator);
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
  const handler = source("lib/sdk-preview-package-route-handler.ts");
  const bridge = source("app/components/game-sdk/GameSdkIframeBridge.tsx");
  const client = source("apps/sdk-preview/lib/package-client-runtime.ts");

  assert.match(route, /createGameSdkMockRuntime/);
  assert.match(route, /createSdkPreviewPackageRouteHandler/);
  assert.match(handler, /runtime\.sendCommand/);
  assert.match(handler, /encodeSdkPreviewPackageSession/);
  assert.doesNotMatch(`${route}\n${handler}`, /SDK_PREVIEW_SIGNING_SECRET/);
  assert.match(handler, /sdkPreviewPackageSessionMaxAgeSeconds/);
  assert.doesNotMatch(`${route}\n${handler}`, /createGameSdkOnlineRoomHttpHandlers|createRedisGameSdk/);
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
    expiresAt: now + 60 * 60 * 1_000,
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
  const token = encodeSdkPreviewPackageSession(session, secret, now);
  assert.notEqual(token.includes('"safe"'), true);
  assert.deepEqual(
    decodeSdkPreviewPackageSession(token, scope, "player-1", secret, now),
    session,
  );
  assert.equal(
    decodeSdkPreviewPackageSession(token, { ...scope, revision: "7".repeat(40) }, "player-1", secret, now),
    null,
  );
  assert.equal(
    decodeSdkPreviewPackageSession(token, { ...scope, creatorSlug: "other" }, "player-1", secret, now),
    null,
  );
  assert.equal(
    decodeSdkPreviewPackageSession(token, { ...scope, gameId: "other" }, "player-1", secret, now),
    null,
  );
  assert.equal(
    decodeSdkPreviewPackageSession(token, scope, "player-2", secret, now),
    null,
  );
  const [noncePart, authTagPart, ciphertextPart] = token.split(".");
  const tampered = [
    noncePart,
    `${authTagPart?.startsWith("a") ? "b" : "a"}${authTagPart?.slice(1) ?? ""}`,
    ciphertextPart,
  ].join(".");
  assert.equal(
    decodeSdkPreviewPackageSession(tampered, scope, "player-1", secret, now),
    null,
  );
  assert.equal(
    decodeSdkPreviewPackageSession(token, scope, "player-1", secret, session.expiresAt),
    null,
  );
  assert.match(
    sdkPreviewPackageSessionSetCookie(scope, token, false),
    /HttpOnly; SameSite=Lax; Max-Age=3600$/,
  );
  assert.match(
    sdkPreviewPackageSessionSetCookie(scope, token, true),
    /HttpOnly; SameSite=Lax; Secure; Max-Age=3600$/,
  );
});

test("Preview package session survives the production-equivalent Set-Cookie roundtrip", () => {
  const session = {
    version: 1 as const,
    scope,
    playerId: "player-1",
    expiresAt: now + 60 * 60 * 1_000,
    room: {
      code: "GF1234",
      revision: 1,
      phase: "lobby",
      players: [],
    },
  };
  const token = encodeSdkPreviewPackageSession(session, secret, now);
  const setCookie = sdkPreviewPackageSessionSetCookie(scope, token, false);
  const cookieHeader = cookieHeaderFromSetCookie(setCookie);

  assert.equal(cookieHeader.startsWith(`${sdkPreviewPackageSessionCookieName(scope)}=${token}`), true);
  assert.deepEqual(
    readSdkPreviewPackageSession(
      cookieHeader,
      scope,
      session.playerId,
      secret,
      now,
    ),
    session,
  );

  const [nameValue] = cookieHeader.split(";", 1);
  const [name, value] = nameValue.split("=", 2);
  assert.equal(name, sdkPreviewPackageSessionCookieName(scope));
  assert.equal(value, token);

  const cookie = (nextValue: string) => `${name}=${nextValue}`;
  assert.equal(
    readSdkPreviewPackageSession(
      cookie(token),
      { ...scope, revision: "7".repeat(40) },
      session.playerId,
      secret,
      now,
    ),
    null,
  );
  assert.equal(
    readSdkPreviewPackageSession(cookie(token), scope, "player-2", secret, now),
    null,
  );
  const [noncePart, authTagPart, ciphertextPart] = token.split(".");
  const tampered = [
    noncePart,
    `${authTagPart?.startsWith("a") ? "b" : "a"}${authTagPart?.slice(1) ?? ""}`,
    ciphertextPart,
  ].join(".");
  assert.equal(
    readSdkPreviewPackageSession(cookie(tampered), scope, session.playerId, secret, now),
    null,
  );
  assert.equal(
    readSdkPreviewPackageSession(cookie(token), scope, session.playerId, secret, session.expiresAt),
    null,
  );
});

test("Preview package session uses only the platform session secret with a domain-separated key", () => {
  const packageSession = source("lib/sdk-preview-package-session.ts");
  assert.doesNotMatch(packageSession, /SDK_PREVIEW_SIGNING_SECRET/);

  const previousPlayerSecret = process.env.PLAYER_SESSION_SECRET;
  const previousLlmSecret = process.env.LLM_SESSION_SECRET;
  const previousPreviewSecret = process.env.SDK_PREVIEW_SIGNING_SECRET;
  process.env.PLAYER_SESSION_SECRET = secret;
  delete process.env.LLM_SESSION_SECRET;
  process.env.SDK_PREVIEW_SIGNING_SECRET = "this-must-not-be-used-by-platform";
  try {
    const session = {
      version: 1 as const,
      scope,
      playerId: "player-1",
      expiresAt: now + 60 * 60 * 1_000,
      room: {
        code: "GF1234",
        revision: 1,
        phase: "lobby",
        players: [],
      },
    };
    const token = encodeSdkPreviewPackageSession(session, undefined, now);
    assert.deepEqual(
      decodeSdkPreviewPackageSession(token, scope, "player-1", undefined, now),
      session,
    );
    assert.deepEqual(
      readSdkPreviewPackageSession(
        `${sdkPreviewPackageSessionCookieName(scope)}=${token}`,
        scope,
        "player-1",
        undefined,
        now,
      ),
      session,
    );
  } finally {
    if (previousPlayerSecret === undefined) delete process.env.PLAYER_SESSION_SECRET;
    else process.env.PLAYER_SESSION_SECRET = previousPlayerSecret;
    if (previousLlmSecret === undefined) delete process.env.LLM_SESSION_SECRET;
    else process.env.LLM_SESSION_SECRET = previousLlmSecret;
    if (previousPreviewSecret === undefined) delete process.env.SDK_PREVIEW_SIGNING_SECRET;
    else process.env.SDK_PREVIEW_SIGNING_SECRET = previousPreviewSecret;
  }
});

test("Preview package session fails closed when no platform session secret is configured", () => {
  const previousPlayerSecret = process.env.PLAYER_SESSION_SECRET;
  const previousLlmSecret = process.env.LLM_SESSION_SECRET;
  delete process.env.PLAYER_SESSION_SECRET;
  delete process.env.LLM_SESSION_SECRET;
  try {
    assert.throws(
      () => encodeSdkPreviewPackageSession({
        version: 1,
        scope,
        playerId: "player-1",
        expiresAt: now + 60 * 60 * 1_000,
        room: { code: "GF1234", revision: 1, phase: "lobby", players: [] },
      }, undefined, now),
      /PLAYER_SESSION_SECRET_NOT_CONFIGURED/,
    );
    assert.throws(
      () => decodeSdkPreviewPackageSession("invalid", scope, "player-1"),
      /PLAYER_SESSION_SECRET_NOT_CONFIGURED/,
    );
  } finally {
    if (previousPlayerSecret === undefined) delete process.env.PLAYER_SESSION_SECRET;
    else process.env.PLAYER_SESSION_SECRET = previousPlayerSecret;
    if (previousLlmSecret === undefined) delete process.env.LLM_SESSION_SECRET;
    else process.env.LLM_SESSION_SECRET = previousLlmSecret;
  }
});
