import assert from "node:assert/strict";
import test from "node:test";
import { createSdkAccountLinkCode, parseSdkAccountLinkCode } from "../lib/sdk-account-link.ts";

test("SDK account link code is signed and expires", () => {
  const previous = process.env.SDK_ACCOUNT_LINK_SECRET;
  process.env.SDK_ACCOUNT_LINK_SECRET = "test-sdk-account-link-secret-that-is-long-enough";
  try {
  const payload = { playerId: "player-1", playerName: "test10", audience: "https://sdk-dev.game-fields.com", expiresAt: Date.now() + 60_000 };
    const code = createSdkAccountLinkCode(payload);
    assert.deepEqual(parseSdkAccountLinkCode(code), payload);
    assert.equal(parseSdkAccountLinkCode(`${code}x`), null);
    assert.equal(parseSdkAccountLinkCode(createSdkAccountLinkCode({ ...payload, expiresAt: Date.now() - 1 })), null);
  } finally {
    if (previous === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previous;
  }
});
