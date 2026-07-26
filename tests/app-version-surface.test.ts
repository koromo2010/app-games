import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const release = JSON.parse(readFileSync("config/app-release.json", "utf8")) as {
  version: string;
};

const mainFooter = readFileSync("app/components/SiteFooter.tsx", "utf8");
const lobbyHeader = readFileSync("app/games/LobbyHeader.tsx", "utf8");
const sdkPortalLayout = readFileSync("apps/sdk-portal/app/layout.tsx", "utf8");
const sdkPreviewLayout = readFileSync("apps/sdk-preview/app/layout.tsx", "utf8");

test("shared app version is semantic", () => {
  assert.match(release.version, /^\d+\.\d+\.\d+$/);
});

test("main, dev, SDK Portal and SDK Preview render the shared app version", () => {
  assert.match(mainFooter, /config\/app-release\.json/);
  assert.match(mainFooter, /v\{release\.version\}/);

  assert.match(sdkPortalLayout, /config\/app-release\.json/);
  assert.match(sdkPortalLayout, /v\{release\.version\}/);

  assert.match(sdkPreviewLayout, /config\/app-release\.json/);
  assert.match(sdkPreviewLayout, /v\{release\.version\}/);
});

test("the main lobby exposes contact without requiring a footer scroll", () => {
  assert.match(lobbyHeader, /AppLink as Link/);
  assert.match(lobbyHeader, /href="\/contact"/);
  assert.match(lobbyHeader, /footer\.contact/);
});
