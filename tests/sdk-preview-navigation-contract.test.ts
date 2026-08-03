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
