import assert from "node:assert/strict";
import test from "node:test";
import { calculateGameRatingChanges, gameRatingConfig } from "../lib/game-rating.ts";

test("2人では通常のEloと同じ変動になる", () => {
  const changes = calculateGameRatingChanges([
    { playerId: "a", rating: 1000, performanceScore: 3, gamesPlayed: 0 },
    { playerId: "b", rating: 1000, performanceScore: -1, gamesPlayed: 0 },
  ]);
  assert.equal(gameRatingConfig.provisionalGames, 30);
  assert.deepEqual(changes.map(({ playerId, change, ratingAfter }) => ({ playerId, change, ratingAfter })), [
    { playerId: "a", change: 24, ratingAfter: 1024 },
    { playerId: "b", change: -24, ratingAfter: 976 },
  ]);
});

test("3人以上は各相手との勝敗による変動量を平均する", () => {
  const changes = calculateGameRatingChanges([
    { playerId: "a", rating: 1000, performanceScore: 3, gamesPlayed: 0 },
    { playerId: "b", rating: 1000, performanceScore: 2, gamesPlayed: 0 },
    { playerId: "c", rating: 1000, performanceScore: -1, gamesPlayed: 0 },
  ]);
  assert.deepEqual(changes.map(({ playerId, change }) => ({ playerId, change })), [
    { playerId: "a", change: 24 },
    { playerId: "b", change: 0 },
    { playerId: "c", change: -24 },
  ]);
});

test("同点同士を引き分けとして多人数変動へ含める", () => {
  const changes = calculateGameRatingChanges([
    { playerId: "a", rating: 1000, performanceScore: 3, gamesPlayed: 0 },
    { playerId: "b", rating: 1000, performanceScore: 3, gamesPlayed: 0 },
    { playerId: "c", rating: 1000, performanceScore: -1, gamesPlayed: 0 },
  ]);
  assert.deepEqual(changes.map(({ playerId, change }) => ({ playerId, change })), [
    { playerId: "a", change: 12 },
    { playerId: "b", change: 12 },
    { playerId: "c", change: -24 },
  ]);
});

test("30戦未満だけ初心者補正K=48を使い、以後はK=20にする", () => {
  const changes = calculateGameRatingChanges([
    { playerId: "beginner", rating: 1000, performanceScore: 1, gamesPlayed: 29 },
    { playerId: "established", rating: 1000, performanceScore: 0, gamesPlayed: 30 },
  ]);
  assert.equal(gameRatingConfig.provisionalK, 48);
  assert.equal(gameRatingConfig.establishedK, 20);
  assert.deepEqual(changes.map(({ playerId, change }) => ({ playerId, change })), [
    { playerId: "beginner", change: 24 },
    { playerId: "established", change: -10 },
  ]);
});

test("同点でもレート差に応じて引き分けのElo変動を計算する", () => {
  const changes = calculateGameRatingChanges([
    { playerId: "high", rating: 1200, performanceScore: 5, gamesPlayed: 30 },
    { playerId: "low", rating: 1000, performanceScore: 5, gamesPlayed: 30 },
  ]);
  assert.deepEqual(changes.map(({ playerId, change }) => ({ playerId, change })), [
    { playerId: "high", change: -5 },
    { playerId: "low", change: 5 },
  ]);
});
