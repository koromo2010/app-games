import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertExpectedAccountContext,
  createAccountContext,
  createAccountRef,
} from "../apps/sdk-portal/lib/account-context.ts";

const secret = "test-only-account-context-secret-with-32-bytes";

test("accountRef is deterministic, domain separated, environment scoped, and non-secret", () => {
  const previous = process.env.SDK_ACCOUNT_LINK_SECRET;
  process.env.SDK_ACCOUNT_LINK_SECRET = secret;
  try {
    const development = createAccountContext({
      playerId: "player-one",
      displayName: "同名アカウント",
      origin: "https://sdk-dev.game-fields.com",
    });
    const same = createAccountContext({
      playerId: "player-one",
      displayName: "別表示名",
      origin: "https://sdk-dev.game-fields.com",
    });
    const production = createAccountRef("player-one", "production");
    const otherPlayer = createAccountRef("player-two", "development");

    assert.equal(development.accountRef, same.accountRef);
    assert.notEqual(development.accountRef, production);
    assert.notEqual(development.accountRef, otherPlayer);
    assert.match(development.accountRef, /^acr_v1_[A-Za-z0-9_-]+$/);
    assert.equal(development.displayName, "同名アカウント");
    assert.equal(development.environment, "development");
    assert.doesNotMatch(JSON.stringify(development), /player-one/);
    assert.doesNotMatch(JSON.stringify(development), /test-only-account-context-secret-with-32-bytes/);
  } finally {
    if (previous === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previous;
  }
});

test("owner-bound writes fail closed for missing or different accountRef", () => {
  const previous = process.env.SDK_ACCOUNT_LINK_SECRET;
  process.env.SDK_ACCOUNT_LINK_SECRET = secret;
  try {
    const context = createAccountContext({
      playerId: "player-one",
      origin: "https://sdk-dev.game-fields.com",
    });
    assert.deepEqual(
      assertExpectedAccountContext({
        expectedAccountRef: context.accountRef,
        playerId: "player-one",
        origin: "https://sdk-dev.game-fields.com",
      }),
      context,
    );
    assert.throws(
      () => assertExpectedAccountContext({
        expectedAccountRef: undefined,
        playerId: "player-one",
        origin: "https://sdk-dev.game-fields.com",
      }),
      /SDK_ACCOUNT_CONTEXT_REQUIRED/,
    );
    assert.throws(
      () => assertExpectedAccountContext({
        expectedAccountRef: context.accountRef,
        expectedContextVersion: 99,
        playerId: "player-one",
        origin: "https://sdk-dev.game-fields.com",
      }),
      /SDK_ACCOUNT_CONTEXT_MISMATCH/,
    );
    assert.throws(
      () => assertExpectedAccountContext({
        expectedAccountRef: context.accountRef,
        playerId: "player-one",
        origin: "https://sdk.game-fields.com",
      }),
      /SDK_ACCOUNT_CONTEXT_MISMATCH/,
    );
  } finally {
    if (previous === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previous;
  }
});

test("MCP route declares expectedAccountRef for every owner-bound write and never exposes raw player IDs", () => {
  const source = readFileSync("apps/sdk-portal/app/api/mcp/route.ts", "utf8");
  assert.match(source, /const ownerBoundWriteTools = new Set/);
  assert.match(source, /expectedAccountRef: expectedAccountRefSchema/);
  assert.match(source, /SDK_ACCOUNT_CONTEXT_MISMATCH/);
  assert.match(source, /accountContext/);
  assert.doesNotMatch(source, /return .*playerId/);
});
