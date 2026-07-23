import assert from "node:assert/strict";
import test from "node:test";
import { appLocaleRouteAction, localizedAppHref } from "../lib/app-locale-routing.ts";

test("言語付きURLを内部routeへrewriteする", () => {
  assert.deepEqual(appLocaleRouteAction("/ja/games", null, "ja"), {
    kind: "rewrite",
    locale: "ja",
    pathname: "/games",
  });
});

test("内部rewrite後の再実行では同じ言語URLへredirectしない", () => {
  assert.deepEqual(appLocaleRouteAction("/games", "ja", "ja"), {
    kind: "next",
    locale: "ja",
  });
});

test("通常の接頭辞なしURLは選択言語へredirectする", () => {
  assert.deepEqual(appLocaleRouteAction("/games", null, "en"), {
    kind: "redirect",
    locale: "en",
    pathname: "/en/games",
  });
});

test("画面内リンクは現在言語を付けて追加redirectを避ける", () => {
  assert.equal(localizedAppHref("/games", "ja"), "/ja/games");
  assert.equal(localizedAppHref("/wordwolf?room=ABCD#players", "en"), "/en/wordwolf?room=ABCD#players");
  assert.equal(localizedAppHref("/ja/games", "en"), "/ja/games");
  assert.equal(localizedAppHref("/api/player-session", "ja"), "/api/player-session");
  assert.equal(localizedAppHref("https://example.com", "ja"), "https://example.com");
});
