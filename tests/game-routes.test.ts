import assert from "node:assert/strict";
import test from "node:test";
import {
  builtInGameRoutes,
  gameCatalogHref,
  gameLandingHref,
  gameMarketingRouteForPathname,
  gamePlayHref,
  gameRouteForId,
  legacyGamePlayRoute,
  publishedMarketingGameRoutes,
  visibleMarketingGameRoutes,
} from "../lib/game-routes.ts";
import { gameMarketingMetadata } from "../lib/game-marketing-metadata.ts";
import {
  requireGameMarketingPageStatus,
} from "../lib/game-marketing-publication.ts";

test("built-in game routes resolve one landing and play route per registration", () => {
  assert.equal(builtInGameRoutes.length, 9);
  assert.equal(new Set(builtInGameRoutes.map((route) => route.slug)).size, 9);
  assert.equal(gameLandingHref("wordwolf"), "/games/word-wolf");
  assert.equal(gameCatalogHref("tahoiya"), "/play/tahoiya");
  assert.equal(gameCatalogHref("wordwolf"), "/play/word-wolf");
  assert.equal(gamePlayHref("hodoai"), "/play/word-scale");
  assert.equal(gamePlayHref("tahoiya", "AB C"), "/play/tahoiya?room=AB%20C");
});

test("catalog entries always use direct play even when their marketing page is published", () => {
  for (const route of builtInGameRoutes) {
    assert.equal(gameCatalogHref(route.id), route.playPath, route.id);
  }
});

test("legacy game routes retain locale responsibility without matching landing routes", () => {
  assert.deepEqual(legacyGamePlayRoute("/ja/wordwolf"), { locale: "ja", playPath: "/play/word-wolf" });
  assert.deepEqual(legacyGamePlayRoute("/en/hodoai-talk/"), { locale: "en", playPath: "/play/word-scale" });
  assert.deepEqual(legacyGamePlayRoute("/code-intercept"), { locale: null, playPath: "/play/code-intercept" });
  assert.equal(legacyGamePlayRoute("/ja/games/code-intercept"), null);
  assert.equal(legacyGamePlayRoute("/ja/play/word-wolf"), null);
});

test("every registered legacy alias resolves with or without locale and trailing slash", () => {
  for (const route of builtInGameRoutes) {
    for (const legacyPath of route.legacyPaths) {
      for (const locale of [null, "ja", "en"] as const) {
        const localizedPath = locale ? `/${locale}${legacyPath}` : legacyPath;
        for (const suffix of ["", "/"]) {
          assert.deepEqual(
            legacyGamePlayRoute(`${localizedPath}${suffix}`),
            { locale, playPath: route.playPath },
            `${localizedPath}${suffix}`,
          );
        }
      }
    }
  }
});

test("registry requires one valid marketing page status and publishes only tahoiya", () => {
  assert.deepEqual(
    builtInGameRoutes.map((route) => [route.id, route.registration.marketingPage.status]),
    [
      ["wordwolf", "draft"],
      ["tahoiya", "published"],
      ["northern-branch", "draft"],
      ["hodoai", "draft"],
      ["kotoba-senpuku", "draft"],
      ["nigoichi", "draft"],
      ["code-intercept", "draft"],
      ["canvas", "draft"],
      ["daifugo", "draft"],
    ],
  );
  assert.throws(() => requireGameMarketingPageStatus({}), /GAME_MARKETING_PAGE_STATUS_INVALID/);
  assert.throws(
    () => requireGameMarketingPageStatus({ marketingPage: { status: "archived" } }),
    /GAME_MARKETING_PAGE_STATUS_INVALID/,
  );
});

test("semantic environment policy hides drafts only in production", () => {
  assert.deepEqual(
    visibleMarketingGameRoutes("production").map((route) => route.id),
    ["tahoiya"],
  );
  for (const environment of ["development", "candidate-preview", "sdk-portal", "test"] as const) {
    assert.equal(visibleMarketingGameRoutes(environment).length, builtInGameRoutes.length, environment);
  }
});

test("sitemap candidates contain only published marketing landing routes", () => {
  const routes = publishedMarketingGameRoutes();
  assert.deepEqual(routes.map((route) => route.id), ["tahoiya"]);
  assert.ok(routes.every((route) => route.landingPath.startsWith("/games/")));
  assert.ok(routes.every((route) => !route.playPath.includes(route.landingPath)));
  assert.equal(routes.some((route) => route.id === "canvas"), false);
  assert.equal(routes.some((route) => route.id === "tahoiya"), true);
});

test("marketing route lookup accepts localized physical LP paths only", () => {
  assert.equal(gameMarketingRouteForPathname("/ja/games/tahoiya")?.id, "tahoiya");
  assert.equal(gameMarketingRouteForPathname("/en/games/word-wolf/")?.id, "wordwolf");
  assert.equal(gameMarketingRouteForPathname("/ja/play/word-wolf"), null);
  assert.equal(gameMarketingRouteForPathname("/ja/wordwolf"), null);
});

test("marketing metadata follows the same publication policy as the route", () => {
  const tahoiya = gameRouteForId("tahoiya");
  const wordwolf = gameRouteForId("wordwolf");
  assert.ok(tahoiya);
  assert.ok(wordwolf);

  const published = gameMarketingMetadata({
    route: tahoiya,
    locale: "ja",
    title: "たほい屋",
    description: "description",
    environment: "production",
  });
  const productionDraft = gameMarketingMetadata({
    route: wordwolf,
    locale: "ja",
    title: "ワードウルフ",
    description: "description",
    environment: "production",
  });
  const developmentDraft = gameMarketingMetadata({
    route: wordwolf,
    locale: "en",
    title: "Word Wolf",
    description: "description",
    environment: "development",
  });

  assert.match(JSON.stringify(published), /\/ja\/games\/tahoiya/);
  assert.match(JSON.stringify(published), /\/en\/games\/tahoiya/);
  assert.equal(productionDraft, null);
  assert.match(JSON.stringify(developmentDraft), /\/en\/games\/word-wolf/);
});
