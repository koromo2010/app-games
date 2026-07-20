import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticatedPlayerIdFromCookieStore,
  createPlayerAuthToken,
  playerAuthCookieName,
} from "../lib/player-auth-token.ts";

const secret = "test-player-session-secret-at-least-32-characters";

test("署名済みCookieだけで読取用プレイヤーIDを検証する", () => {
  const previous = process.env.PLAYER_SESSION_SECRET;
  process.env.PLAYER_SESSION_SECRET = secret;
  try {
    const now = 1_000;
    const token = createPlayerAuthToken("player-1", now);
    const store = { get: (name: string) => name === playerAuthCookieName ? { value: token } : undefined };
    assert.equal(authenticatedPlayerIdFromCookieStore(store, now), "player-1");
    assert.equal(authenticatedPlayerIdFromCookieStore(store, now + 31 * 24 * 60 * 60 * 1000), null);
    assert.equal(authenticatedPlayerIdFromCookieStore({ get: () => ({ value: `${token}x` }) }, now), null);
  } finally {
    if (previous === undefined) delete process.env.PLAYER_SESSION_SECRET;
    else process.env.PLAYER_SESSION_SECRET = previous;
  }
});
