import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseDeferredGameLobbyCatalog } from "../app/games/deferred-game-lobby-catalog.ts";
import {
  publicGameCatalogCacheControl,
  publicGameCatalogEtag,
  publicGameCatalogVersion,
  requestAcceptsPublicGameCatalogVersion,
} from "../lib/public-game-catalog-cache.ts";
import { publicGameCatalogResponse } from "../lib/public-game-catalog-response.ts";

test("public catalog uses mandatory ETag revalidation without stale reuse", () => {
  assert.equal(publicGameCatalogCacheControl, "public, max-age=0, must-revalidate");
  const first = publicGameCatalogVersion({ revision: "a".repeat(40) });
  const unchanged = publicGameCatalogVersion({ revision: "a".repeat(40) });
  const mutated = publicGameCatalogVersion({ revision: "b".repeat(40) });
  assert.equal(first, unchanged);
  assert.notEqual(first, mutated);
  const etag = publicGameCatalogEtag(first);
  assert.equal(requestAcceptsPublicGameCatalogVersion(etag, etag), true);
  assert.equal(requestAcceptsPublicGameCatalogVersion(`W/${etag}`, etag), true);
  assert.equal(requestAcceptsPublicGameCatalogVersion(publicGameCatalogEtag(mutated), etag), false);
});

test("deferred payload preserves both locale titles and rejects invalid data", () => {
  const payload = {
    version: "c".repeat(64),
    additionalGames: [{
      id: "sdk-game",
      title: "SDKゲーム",
      englishTitle: "SDK Game",
      visual: "/game-visuals/sdk-game-placeholder.svg",
      tags: ["対戦"],
      href: "/sdk-games/sdk-game",
      players: "2",
      time: "未計測",
      summary: "summary",
      accent: "from-cyan-300",
      private: false,
      stats: "local-disabled",
    }],
    gameOperations: [{
      gameId: "sdk-game",
      publication: "public",
      maintenance: false,
      message: "",
    }],
  };
  const parsed = parseDeferredGameLobbyCatalog(payload);
  assert.equal(parsed?.additionalGames[0]?.title, "SDKゲーム");
  assert.equal(parsed?.additionalGames[0]?.englishTitle, "SDK Game");
  assert.equal(parseDeferredGameLobbyCatalog({ ...payload, version: "invalid" }), null);
});

test("public route is locale-independent and never reads auth or private state", () => {
  const route = readFileSync("app/api/public/game-catalog/route.ts", "utf8");
  const response = readFileSync("lib/public-game-catalog-response.ts", "utf8");
  const client = readFileSync("app/games/use-deferred-game-lobby-catalog.ts", "utf8");
  assert.match(response, /publicGameCatalogCacheControl/);
  assert.match(response, /status: 304/);
  assert.doesNotMatch(route + response, /cookies\(|headers\(\)|x-app-locale|authorization|session|player/i);
  assert.match(client, /credentials: "omit"/);
  assert.doesNotMatch(client, /locale/);
});

test("conditional revalidation returns 304 until public catalog identity changes", async () => {
  let sourceVersion = "a".repeat(64);
  let publication = "public";
  let loads = 0;
  const loadCatalog = async () => {
    loads += 1;
    return {
      sourceVersion,
      additionalGames: [{ id: "sdk-game" }],
      gameOperations: [{ gameId: "sdk-game", publication }],
    };
  };

  const first = await publicGameCatalogResponse(
    new Request("https://game-fields.invalid/api/public/game-catalog"),
    loadCatalog,
  );
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), publicGameCatalogCacheControl);
  const firstEtag = first.headers.get("etag");
  assert.ok(firstEtag);

  const revalidated = await publicGameCatalogResponse(
    new Request("https://game-fields.invalid/api/public/game-catalog", {
      headers: { "If-None-Match": firstEtag },
    }),
    loadCatalog,
  );
  assert.equal(revalidated.status, 304);
  assert.equal(loads, 2, "304 requires a fresh source read, not blind stale reuse");

  publication = "hidden";
  const invalidatedByOperationMutation = await publicGameCatalogResponse(
    new Request("https://game-fields.invalid/api/public/game-catalog", {
      headers: { "If-None-Match": firstEtag },
    }),
    loadCatalog,
  );
  assert.equal(invalidatedByOperationMutation.status, 200);
  assert.notEqual(invalidatedByOperationMutation.headers.get("etag"), firstEtag);

  sourceVersion = "b".repeat(64);
  const invalidatedByCatalogMutation = await publicGameCatalogResponse(
    new Request("https://game-fields.invalid/api/public/game-catalog", {
      headers: { "If-None-Match": invalidatedByOperationMutation.headers.get("etag")! },
    }),
    loadCatalog,
  );
  assert.equal(invalidatedByCatalogMutation.status, 200);
  assert.notEqual(
    invalidatedByCatalogMutation.headers.get("etag"),
    invalidatedByOperationMutation.headers.get("etag"),
  );
});
