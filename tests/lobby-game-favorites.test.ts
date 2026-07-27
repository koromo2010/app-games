import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeFavoriteGameIds,
  parseFavoriteGameIds,
  sortGamesByFavorite,
} from "../app/games/lobby-game-favorites.ts";

test("favorite ids are normalized and malformed storage is ignored", () => {
  assert.deepEqual(normalizeFavoriteGameIds(["wordwolf", "", "wordwolf", 42, "tahoiya"]), ["wordwolf", "tahoiya"]);
  assert.deepEqual(parseFavoriteGameIds('["wordwolf","tahoiya"]'), ["wordwolf", "tahoiya"]);
  assert.deepEqual(parseFavoriteGameIds("{broken"), []);
});

test("favorite games move to the front without changing group order", () => {
  const games = [{ id: "one" }, { id: "two" }, { id: "three" }, { id: "four" }];
  assert.deepEqual(
    sortGamesByFavorite(games, new Set(["two", "four"])).map((game) => game.id),
    ["two", "four", "one", "three"],
  );
  assert.deepEqual(games.map((game) => game.id), ["one", "two", "three", "four"]);
});
