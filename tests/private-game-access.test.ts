import assert from "node:assert/strict";
import test from "node:test";
import { privateGameCookieMatches, privateGameCookieValue, privateGameKeyMatches } from "../lib/private-game-access.ts";

test("Private権限は設定キーから作ったCookieだけを受け付ける", () => {
  const previous = process.env.PRIVATE_GAME_ACCESS_KEY;
  process.env.PRIVATE_GAME_ACCESS_KEY = "private-test-key";
  try {
    assert.equal(privateGameKeyMatches("private-test-key"), true);
    assert.equal(privateGameKeyMatches("wrong-key"), false);
    assert.equal(privateGameCookieMatches(privateGameCookieValue()), true);
    assert.equal(privateGameCookieMatches(""), false);
  } finally {
    if (previous === undefined) delete process.env.PRIVATE_GAME_ACCESS_KEY;
    else process.env.PRIVATE_GAME_ACCESS_KEY = previous;
  }
});
