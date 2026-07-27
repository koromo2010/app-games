import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  checkSdkCreatorOwnership,
  sdkDashboardHrefForAccess,
  sdkPortalInternalBaseUrl,
} from "../lib/sdk-dashboard-navigation.ts";
import { parseSdkAccountLinkCode } from "../lib/sdk-account-link.ts";

const creatorLobby = readFileSync("app/sdk-preview/[creatorSlug]/page.tsx", "utf8");
const gameLobby = readFileSync("app/games/GameLobby.tsx", "utf8");
const lobbyHeader = readFileSync("app/games/LobbyHeader.tsx", "utf8");
const accountMenu = readFileSync("app/games/LobbyAccountMenu.tsx", "utf8");

test("creator lobby passes its SDK dashboard URL through the shared lobby", () => {
  assert.match(creatorLobby, /sdkCreatorSlug=\{creatorSlug\}/);
  assert.match(creatorLobby, /sdkDashboardHref=\{`\$\{sdkPortalInternalBaseUrl\(\)\}\/dashboard`\}/);
  assert.match(gameLobby, /sdkDashboardHref=\{visibleSdkDashboardHref\}/);
  assert.match(lobbyHeader, /sdkDashboardHref=\{props\.sdkDashboardHref\}/);
});

test("account menu renders the SDK dashboard link only when ownership grants a URL", () => {
  assert.match(accountMenu, /props\.sdkDashboardHref && <a href=\{props\.sdkDashboardHref\}/);
  assert.match(accountMenu, /t\("account\.openSdkDashboard"\)/);
  const href = "https://sdk-dev.game-fields.com/dashboard";
  assert.equal(sdkDashboardHrefForAccess({
    href,
    isLoggedIn: true,
    isCreatorOwner: true,
  }), href);
  assert.equal(sdkDashboardHrefForAccess({
    href,
    isLoggedIn: true,
    isCreatorOwner: false,
  }), undefined);
  assert.equal(sdkDashboardHrefForAccess({
    href,
    isLoggedIn: false,
    isCreatorOwner: true,
  }), undefined);
});

test("creator ownership check uses the existing signed account proof", async () => {
  const previous = process.env.SDK_ACCOUNT_LINK_SECRET;
  process.env.SDK_ACCOUNT_LINK_SECRET = "test-sdk-account-link-secret-that-is-long-enough";
  try {
    let requestedUrl = "";
    const owner = await checkSdkCreatorOwnership({
      creatorSlug: "moi-lab",
      playerId: "moi-dev-player-id",
      portalBaseUrl: "https://sdk-dev.game-fields.com",
      fetchImpl: async (input, init) => {
        requestedUrl = String(input);
        const authorization = new Headers(init?.headers).get("authorization") ?? "";
        const account = parseSdkAccountLinkCode(
          authorization.replace(/^Bearer /, ""),
        );
        assert.equal(account?.playerId, "moi-dev-player-id");
        assert.equal(account?.audience, "https://sdk-dev.game-fields.com");
        return Response.json({ owner: true });
      },
    });
    assert.equal(owner, true);
    assert.equal(
      requestedUrl,
      "https://sdk-dev.game-fields.com/api/preview-owner/moi-lab",
    );
  } finally {
    if (previous === undefined) delete process.env.SDK_ACCOUNT_LINK_SECRET;
    else process.env.SDK_ACCOUNT_LINK_SECRET = previous;
  }
});

test("SDK Portal URL resolves per environment before branch fallback", () => {
  assert.equal(sdkPortalInternalBaseUrl({
    SDK_PORTAL_INTERNAL_URL: "https://custom-sdk.example/",
    VERCEL_GIT_COMMIT_REF: "main",
  }), "https://custom-sdk.example");
  assert.equal(sdkPortalInternalBaseUrl({
    VERCEL_GIT_COMMIT_REF: "main",
  }), "https://sdk.game-fields.com");
  assert.equal(sdkPortalInternalBaseUrl({
    VERCEL_GIT_COMMIT_REF: "develop",
  }), "https://sdk-dev.game-fields.com");
});
