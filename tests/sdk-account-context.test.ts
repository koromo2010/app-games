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

test("MCP route inventories every current main owner-bound write and guards it before persistence", () => {
  const source = readFileSync("apps/sdk-portal/app/api/mcp/route.ts", "utf8");
  const aliases = source.match(
    /const prepareModuleProfileUpdateToolNames = new Set\(\[([\s\S]*?)\]\);/,
  )?.[1];
  const ownerBound = source.match(
    /const ownerBoundWriteTools = new Set\(\[([\s\S]*?)\]\);/,
  )?.[1];
  assert.ok(aliases);
  assert.ok(ownerBound);

  const quotedNames = (value: string) =>
    [...value.matchAll(/"([a-z0-9_]+)"/g)].map((match) => match[1]);
  const ownerBoundInventory = [...new Set([
    ...quotedNames(ownerBound),
    ...quotedNames(aliases),
  ])].sort();
  const expectedInventory = [
    "approve_mock",
    "create_game_draft",
    "finalize_creator_url",
    "prepare_game_module_profile_update",
    "prepare_module_profile_update",
    "prepare_support_reply",
    "prepare_support_report",
    "publish_game_package",
    "publish_game_source_package",
    "publish_mock",
    "reserve_creator_url",
  ].sort();
  assert.deepEqual(ownerBoundInventory, expectedInventory);

  const baseTools = source.match(/const baseTools = \[([\s\S]*?)\n\];/)?.[1];
  assert.ok(baseTools);
  const catalogWrites = [...baseTools.matchAll(
    /\{ name: "([a-z0-9_]+)"[\s\S]*?annotations: \{ readOnlyHint: (true|false),[\s\S]*?(?=\n\s*\{ name:|$)/g,
  )]
    .filter((match) => match[2] === "false")
    .map((match) => match[1]);
  if (
    baseTools.includes('{ name: "prepare_module_profile_update", ...prepareModuleProfileUpdateToolDefinition }')
    && /const prepareModuleProfileUpdateToolDefinition = \{[\s\S]*?readOnlyHint: false/.test(source)
  ) catalogWrites.push("prepare_module_profile_update");
  const expectedCatalogWrites = expectedInventory.filter(
    (name) => name !== "prepare_game_module_profile_update",
  );
  assert.deepEqual([...new Set(catalogWrites)].sort(), expectedCatalogWrites);

  assert.match(source, /expectedAccountRef: expectedAccountRefSchema/);
  assert.match(source, /ownerBoundWriteTools\.has\(tool\.name\)/);
  assert.match(source, /ownerBoundWriteTools\.has\(name\)[\s\S]*?assertExpectedAccountContext/);
  assert.match(source, /SDK_ACCOUNT_CONTEXT_MISMATCH/);
  assert.match(source, /accountContext/);
  assert.doesNotMatch(source, /return .*playerId/);
  assert.ok(
    source.indexOf("const accountContext: PublicAccountContext")
      < source.indexOf('if (name === "prepare_support_reply")'),
  );
});

test("account mismatch fixture invokes no persistent store", () => {
  const previous = process.env.SDK_ACCOUNT_LINK_SECRET;
  process.env.SDK_ACCOUNT_LINK_SECRET = secret;
  let persistentStoreInvocations = 0;
  const guardedWrite = (expectedAccountRef: string) => {
    assertExpectedAccountContext({
      expectedAccountRef,
      playerId: "actual-player",
      origin: "https://sdk.game-fields.com",
    });
    persistentStoreInvocations += 1;
  };
  try {
    const otherAccount = createAccountRef("other-player", "production");
    assert.throws(() => guardedWrite(otherAccount), /SDK_ACCOUNT_CONTEXT_MISMATCH/);
    assert.equal(persistentStoreInvocations, 0);
  } finally {
    if (previous === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previous;
  }
});

test("support draft and reply pages receive accountRef before loading a resource", () => {
  for (const file of [
    "apps/sdk-portal/app/support/drafts/[draftId]/page.tsx",
    "apps/sdk-portal/app/support/replies/[draftId]/page.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /params,\s*searchParams,/s);
    assert.match(source, /const \{ accountRef \} = await searchParams;/);
    assert.match(source, /SupportAccountMismatch/);
    assert.ok(source.indexOf("return <SupportAccountMismatch />") < source.indexOf("state = await loadCreatorSupport"));
  }
});
