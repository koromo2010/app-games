import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { normalizeAppLocale } from "../lib/app-locale.ts";
import { appMessages, translateApp } from "../lib/app-i18n.ts";
import {
  assertGameLocaleAvailable,
  assertRoomLanguageAccess,
  filterRoomPageByLocale,
  languageBoundGameIds,
  isGameLocaleAvailable,
  isGameUiLocaleAvailable,
} from "../lib/game-language.ts";

test("旧アカウントと旧部屋は日本語として扱う", () => {
  assert.equal(normalizeAppLocale(undefined), "ja");
  assert.doesNotThrow(() => assertRoomLanguageAccess({}, "ja"));
  assert.throws(() => assertRoomLanguageAccess({}, "en"), /ROOM_LANGUAGE_MISMATCH/);
});

test("言語依存ゲームの部屋一覧はアカウント言語だけを返す", () => {
  const page = filterRoomPageByLocale({
    rooms: [
      { code: "JA01", contentLocale: "ja" },
      { code: "EN01", contentLocale: "en" },
      { code: "OLD1" },
    ],
    nextCursor: "10",
  }, "en");
  assert.deepEqual(page.rooms.map((room) => room.code), ["EN01"]);
  assert.equal(page.nextCursor, "10");
});

test("対応コンテンツがない言語では部屋を作成できない", () => {
  assert.doesNotThrow(() => assertGameLocaleAvailable("wordwolf", "ja"));
  assert.throws(() => assertGameLocaleAvailable("wordwolf", "en"), /GAME_LANGUAGE_UNAVAILABLE/);
});

test("非言語ゲームは英語アカウントでも利用でき、言語依存ゲームは対応完了まで止める", () => {
  assert.equal(isGameLocaleAvailable("daifugo", "en"), true);
  assert.equal(isGameLocaleAvailable("canvas", "en"), true);
  assert.equal(isGameLocaleAvailable("wordwolf", "en"), false);
  assert.equal(isGameLocaleAvailable("code-intercept", "en"), false);
});

test("英語UI完成前の非言語ゲームはロビーで止めるが、部屋の言語互換性とは分離する", () => {
  assert.equal(isGameLocaleAvailable("canvas", "en"), true);
  assert.equal(isGameUiLocaleAvailable("canvas", "en"), false);
  assert.equal(isGameUiLocaleAvailable("daifugo", "en"), true);
  assert.equal(isGameUiLocaleAvailable("canvas", "ja"), true);
});

test("英語辞書は日本語辞書と同じキーを持ち、変数を展開できる", () => {
  assert.deepEqual(Object.keys(appMessages.en).sort(), Object.keys(appMessages.ja).sort());
  assert.equal(translateApp("en", "games.searchResults", { count: 3 }), "3 games found. Minor spelling variations and typos are supported.");
  assert.equal(translateApp("ja", "card.count", { count: 7 }), "7枚");
});

test("全言語依存Room APIが一覧・作成・参加の言語検査を持つ", async () => {
  const games = ["wordwolf", "tahoiya", "hodoai", "kotoba-senpuku", "nigoichi", "code-intercept"];
  for (const game of games) {
    const source = await readFile(new URL(`../app/api/${game}/rooms/route.ts`, import.meta.url), "utf8");
    assert.match(source, /filterRoomPageByLocale/);
    assert.match(source, /assertGameLocaleAvailable/);
    assert.match(source, /assertRoomLanguageAccess/);
  }
});

test("言語依存ゲームは共通ゲーム登録簿に存在する", async () => {
  const registry = JSON.parse(await readFile(new URL("../config/game-registry.json", import.meta.url), "utf8")) as Array<{ id: string }>;
  const registered = new Set(registry.map((game) => game.id));
  for (const gameId of languageBoundGameIds) assert.equal(registered.has(gameId), true, gameId);
});
