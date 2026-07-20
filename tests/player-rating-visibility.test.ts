import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayedGameRatings } from "../lib/player-rating-visibility.ts";

const gameTypes = ["played-result", "played-redis", "played-postgres", "not-played"] as const;

test("レーティングは1回以上プレイしたゲームだけ返す", () => {
  const ratings = buildPlayedGameRatings({
    gameTypes,
    results: [{ gameType: "played-result", ratingAfter: 1040 }],
    storedRatings: [null, "980", null, null],
    postgresStates: new Map([["played-postgres", { rating: 1012, gamesPlayed: 1 }]]),
    initialRating: 1000,
  });
  assert.deepEqual(ratings, {
    "played-result": 1040,
    "played-redis": 980,
    "played-postgres": 1012,
  });
});

test("旧戦績にレート値がなくてもプレイ済みなら初期レートを表示する", () => {
  assert.deepEqual(buildPlayedGameRatings({
    gameTypes: ["legacy"] as const,
    results: [{ gameType: "legacy" }],
    storedRatings: [null],
    initialRating: 1000,
  }), { legacy: 1000 });
});
