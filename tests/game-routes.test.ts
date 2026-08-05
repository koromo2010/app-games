import assert from "node:assert/strict";
import test from "node:test";
import {
  builtInGameRoutes,
  gameLandingHref,
  gamePlayHref,
  legacyGamePlayRoute,
  publicGameRoutes,
} from "../lib/game-routes.ts";

test("built-in game routes resolve one landing and play route per registration", () => {
  assert.equal(builtInGameRoutes.length, 9);
  assert.equal(new Set(builtInGameRoutes.map((route) => route.slug)).size, 9);
  assert.equal(gameLandingHref("wordwolf"), "/games/word-wolf");
  assert.equal(gamePlayHref("hodoai"), "/play/word-scale");
  assert.equal(gamePlayHref("tahoiya", "AB C"), "/play/tahoiya?room=AB%20C");
});

test("legacy game routes retain locale responsibility without matching landing routes", () => {
  assert.deepEqual(legacyGamePlayRoute("/ja/wordwolf"), { locale: "ja", playPath: "/play/word-wolf" });
  assert.deepEqual(legacyGamePlayRoute("/en/hodoai-talk/"), { locale: "en", playPath: "/play/word-scale" });
  assert.deepEqual(legacyGamePlayRoute("/code-intercept"), { locale: null, playPath: "/play/code-intercept" });
  assert.equal(legacyGamePlayRoute("/ja/games/code-intercept"), null);
  assert.equal(legacyGamePlayRoute("/ja/play/word-wolf"), null);
});

test("sitemap candidates contain only public landing routes", () => {
  const routes = publicGameRoutes();
  assert.ok(routes.every((route) => !route.registration.private));
  assert.ok(routes.every((route) => route.landingPath.startsWith("/games/")));
  assert.ok(routes.every((route) => !route.playPath.includes(route.landingPath)));
  assert.equal(routes.some((route) => route.id === "canvas"), false);
  assert.equal(routes.some((route) => route.id === "tahoiya"), true);
});
