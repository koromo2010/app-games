import assert from "node:assert/strict";
import test from "node:test";
import { filterGamesBySearch, gameMatchesSearch, normalizeGameSearchText } from "../lib/game-catalog-search.ts";

const games = [
  { id: "wordwolf", title: "ワードウルフ", englishTitle: "WORD WOLF", href: "/wordwolf", tags: ["対戦", "会話"], summary: "似たお題について話し、少数派を探します。" },
  { id: "hodoai", title: "ワードスケール", englishTitle: "WORD SCALE", href: "/word-scale", tags: ["協力", "連想"], summary: "秘密の数字をことばで伝えて並べます。" },
] as const;

test("ゲーム検索は英数字・かなの表記を正規化する", () => {
  assert.equal(normalizeGameSearchText("ＷＯＲＤ　ウルフ"), "word うるふ");
});

test("タイトル、英題、タグ、説明文を検索できる", () => {
  assert.deepEqual(filterGamesBySearch(games, "ウルフ").map((game) => game.id), ["wordwolf"]);
  assert.deepEqual(filterGamesBySearch(games, "scale").map((game) => game.id), ["hodoai"]);
  assert.deepEqual(filterGamesBySearch(games, "協力 連想").map((game) => game.id), ["hodoai"]);
  assert.deepEqual(filterGamesBySearch(games, "少数派").map((game) => game.id), ["wordwolf"]);
});

test("3文字以上は軽い入力ミスを許容し、短すぎる語は曖昧一致させない", () => {
  assert.equal(gameMatchesSearch(games[0], "ウルブ"), true);
  assert.equal(gameMatchesSearch(games[1], "word sclae"), true);
  assert.equal(gameMatchesSearch(games[0], "協カ"), false);
});
