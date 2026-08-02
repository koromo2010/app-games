import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  sdkDashboardHrefForAccess,
  sdkPortalInternalBaseUrl,
} from "../lib/sdk-dashboard-navigation.ts";
import { parseSdkAccountLinkCode } from "../lib/sdk-account-link.ts";

const creatorLobby = readFileSync("app/sdk-preview/[creatorSlug]/page.tsx", "utf8");
const gameLobby = readFileSync("app/games/GameLobby.tsx", "utf8");
const lobbyHeader = readFileSync("app/games/LobbyHeader.tsx", "utf8");
const accountMenu = readFileSync("app/games/LobbyAccountMenu.tsx", "utf8");
const clientNavigation = readFileSync("lib/sdk-dashboard-navigation.ts", "utf8");
const serverOwnership = readFileSync("lib/sdk-dashboard-ownership.ts", "utf8");

test("account-link signing stays outside the client navigation module", () => {
  assert.doesNotMatch(clientNavigation, /sdk-account-link|node:crypto/);
  assert.match(serverOwnership, /^import ["']server-only["'];/);
  assert.match(serverOwnership, /sdk-account-link/);
  assert.match(gameLobby, /from ["']@\/lib\/sdk-dashboard-navigation["'];/);
  assert.doesNotMatch(gameLobby, /from ["'][^"']*(?:sdk-dashboard-ownership|sdk-account-link|node:crypto)/);
});

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

test("server ownership keeps the existing signed proof contract", () => {
  assert.match(serverOwnership, /createSdkAccountLinkCode/);
  assert.match(serverOwnership, /Authorization: `Bearer \$\{proof\}`/);
  assert.match(serverOwnership, /\/api\/preview-owner\/\$\{encodeURIComponent\(input\.creatorSlug\)\}/);
  assert.match(serverOwnership, /expiresAt: Date\.now\(\) \+ 60_000/);
  assert.match(serverOwnership, /audience: portalOrigin/);
  assert.match(serverOwnership, /payload\.owner === true/);
  assert.match(parseSdkAccountLinkCode.toString(), /timingSafeEqual/);
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
