import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  sdkPortalNavigationStateFromPath,
  sdkPortalPathForState,
  sdkPreviewNavigationMessage,
  sdkPreviewNavigationStateFromPath,
  sdkPreviewPathForState,
} from "../lib/sdk-preview-navigation-contract.ts";

const revision = "a".repeat(40);

test("navigation contract maps list and detail state without a fixed game fallback", () => {
  const state = { creatorSlug: "creator-1", gameId: "game-a", revision };
  assert.equal(sdkPreviewPathForState(state), `/sdk-preview/creator-1/games/game-a?revision=${revision}`);
  assert.equal(sdkPortalPathForState(state), `/creator-1/games/game-a?revision=${revision}`);
  assert.deepEqual(
    sdkPreviewNavigationStateFromPath(
      `/sdk-preview/creator-1/games/game-a`,
      `?revision=${revision}`,
    ),
    state,
  );
  assert.deepEqual(
    sdkPortalNavigationStateFromPath("/creator-1", ""),
    { creatorSlug: "creator-1" },
  );
  assert.equal(
    sdkPreviewNavigationMessage(state).type,
    "game-fields:preview-navigation-v1",
  );
  assert.equal(
    sdkPreviewNavigationStateFromPath("/sdk-preview/creator-1/games/twixt-repro", "")?.gameId,
    "twixt-repro",
  );
});

test("Preview parser accepts the unprefixed and canonical localized route forms", () => {
  const creatorState = { creatorSlug: "creator-1" };
  for (const pathname of [
    "/sdk-preview/creator-1",
    "/ja/sdk-preview/creator-1",
    "/en/sdk-preview/creator-1",
  ]) {
    assert.deepEqual(sdkPreviewNavigationStateFromPath(pathname), creatorState);
  }

  const detailState = { creatorSlug: "creator-1", gameId: "game-a", revision };
  for (const pathname of [
    "/sdk-preview/creator-1/games/game-a",
    "/ja/sdk-preview/creator-1/games/game-a",
    "/en/sdk-preview/creator-1/games/game-a",
  ]) {
    const state = sdkPreviewNavigationStateFromPath(pathname, `?revision=${revision}`);
    assert.deepEqual(state, detailState);
    assert.deepEqual(sdkPreviewNavigationMessage(state!), {
      type: "game-fields:preview-navigation-v1",
      ...detailState,
    });
  }
});

test("Preview parser rejects unsupported locale prefixes and malformed state", () => {
  assert.equal(
    sdkPreviewNavigationStateFromPath("/fr/sdk-preview/creator-1"),
    null,
  );
  assert.equal(
    sdkPreviewNavigationStateFromPath("/ja/sdk-preview/Creator_1"),
    null,
  );
  assert.equal(
    sdkPreviewNavigationStateFromPath("/en/sdk-preview/creator-1/games/game_a"),
    null,
  );
  assert.equal(
    sdkPreviewNavigationStateFromPath(
      "/ja/sdk-preview/creator-1/games/game-a",
      `?revision=${"b".repeat(39)}`,
    ),
    null,
  );
  assert.equal(
    sdkPreviewNavigationStateFromPath("/en/sdk-preview/%E0%A4%A"),
    null,
  );
});

test("Portal and Preview use a validated bidirectional message contract", () => {
  const parent = readFileSync("apps/sdk-portal/app/CreatorPreviewFrame.tsx", "utf8");
  const child = readFileSync("app/sdk-preview/SdkPreviewNavigationBridge.tsx", "utf8");
  assert.match(parent, /event\.source !== frameRef\.current\?\.contentWindow/);
  assert.match(parent, /event\.origin !== targetOrigin/);
  assert.match(parent, /history\.pushState/);
  assert.match(parent, /addEventListener\("popstate"/);
  assert.match(child, /event\.source !== window\.parent/);
  assert.match(child, /event\.origin !== targetOrigin/);
  assert.match(child, /window\.location\.assign/);
  assert.doesNotMatch(parent, /postMessage\([^,]+,\s*["']\*["']/);
  assert.doesNotMatch(child, /postMessage\([^,]+,\s*["']\*["']/);
});
