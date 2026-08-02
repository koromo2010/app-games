import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  creatorAccountLinkUrl,
  creatorMockGameUrl,
} from "../apps/sdk-portal/lib/creator-access-links.ts";
import { normalizeAccountLinkReturnPath } from "../apps/sdk-portal/lib/account-link-return.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("published mocks return a reconnecting creator link and the real mock route", () => {
  assert.equal(
    creatorAccountLinkUrl({
      portalBaseUrl: "https://sdk.game-fields.com/",
      creatorSlug: "krm",
    }),
    "https://sdk.game-fields.com/api/account-link/start?returnTo=%2Fkrm",
  );
  assert.equal(
    creatorMockGameUrl({
      portalBaseUrl: "https://sdk.game-fields.com/",
      creatorSlug: "krm",
      gameId: "corners",
    }),
    "https://sdk.game-fields.com/krm/mock/corners",
  );

  for (const path of [
    "apps/sdk-portal/app/api/mcp/route.ts",
    "apps/sdk-portal/app/api/instances/[instanceId]/games/[gameId]/mock/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /creatorAccountLinkUrl/);
    assert.match(source, /creatorMockGameUrl/);
    assert.doesNotMatch(
      source,
      /const gameUrl = `\$\{portalBaseUrl[^\n]*\$\{slug\}\/games\/\$\{gameId\}`/,
    );
  }
});

test("creator ownership mismatch offers account reconnection instead of a silent 404", () => {
  const reconnect = read("apps/sdk-portal/app/CreatorAccountReconnect.tsx");
  assert.match(reconnect, /<form method="get" action="\/api\/account-link\/start">/);
  assert.match(reconnect, /<input type="hidden" name="returnTo" value=\{safeReturnTo\} \/>/);
  assert.match(reconnect, /Game Fieldsアカウントを再接続/);

  assert.equal(
    normalizeAccountLinkReturnPath("/krm/games/corners?revision=abc"),
    "/krm/games/corners?revision=abc",
  );

  const accountMenu = read("apps/sdk-portal/app/account-menu.tsx");
  assert.match(accountMenu, /<form method="get" action="\/api\/account-link\/start">/);
  assert.match(accountMenu, /account-link-form/);

  const portalHome = read("apps/sdk-portal/app/page.tsx");
  assert.match(portalHome, /<form method="get" action="\/api\/account-link\/start">/);

  const startRoute = read("apps/sdk-portal/app/api/account-link/start/route.ts");
  assert.match(startRoute, /account-link-error/);
  assert.match(startRoute, /normalizeAccountLinkReturnPath/);
  assert.match(read("apps/sdk-portal/app/account-link-error/page.tsx"), /もう一度接続する/);

  for (const path of [
    "apps/sdk-portal/app/[instanceId]/page.tsx",
    "apps/sdk-portal/app/[instanceId]/games/[gameId]/page.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /CreatorAccountReconnect/);
  }
});
