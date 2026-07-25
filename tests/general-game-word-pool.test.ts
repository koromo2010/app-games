import assert from "node:assert/strict";
import test from "node:test";
import {
  generalGameWordDifficultyWeights,
  generalGameWordPoolSource,
  pickGeneralGameWordBand,
  selectGeneralGameWordsForBands,
} from "../lib/general-game-word-pool.ts";
import {
  generalGameWordDifficultyTags,
  generalGameWordPoolFlag,
  generalGameWordPoolKey,
  normalizeLegacyGeneralGameWordClassifications,
} from "../lib/general-game-word-classification.ts";
import {
  generalGameWordDailyHistoryKey,
  generalGameWordHistoryTokyoDay,
} from "../lib/general-game-word-history-store.ts";

test("General Game Pool uses the stored reviewed classification contract", () => {
  assert.equal(generalGameWordPoolSource, "general_game_pool");
  assert.equal(generalGameWordPoolKey, "standard-game");
  assert.equal(generalGameWordPoolFlag, "general_game_pool");
  assert.deepEqual(generalGameWordDifficultyTags, {
    easy: "difficulty_easy",
    normal: "difficulty_normal",
    hard: "difficulty_hard",
  });
});

test("legacy classifications require both the general-pool and saved difficulty flags", () => {
  const records = normalizeLegacyGeneralGameWordClassifications([
    {
      word_master_id: 1,
      surface: " 猫 ",
      reading: "ねこ",
      difficulty_tier: "easy",
      evaluation_flags: ["general_game_pool", "difficulty_easy"],
    },
    {
      word_master_id: 2,
      surface: "度者",
      reading: "どしゃ",
      difficulty_tier: "easy",
      evaluation_flags: ["general_game_pool"],
    },
    {
      word_master_id: 3,
      surface: "宇宙",
      reading: "うちゅう",
      difficulty_tier: "normal",
      evaluation_flags: ["difficulty_normal"],
    },
  ]);
  assert.deepEqual(records, [{
    wordMasterId: 1,
    surface: "猫",
    normalizedSurface: "猫",
    reading: "ねこ",
    difficulty: "easy",
  }]);
});

test("conflicting saved difficulty classifications are rejected", () => {
  assert.throws(
    () => normalizeLegacyGeneralGameWordClassifications([
      {
        word_master_id: 1,
        surface: "猫",
        reading: "ねこ",
        difficulty_tier: "easy",
        evaluation_flags: ["general_game_pool", "difficulty_easy"],
      },
      {
        word_master_id: 2,
        surface: "猫",
        reading: "ねこ",
        difficulty_tier: "hard",
        evaluation_flags: ["general_game_pool", "difficulty_hard"],
      },
    ]),
    /GENERAL_GAME_WORD_CLASSIFICATION_CONFLICT/,
  );
});

test("difficulty mixing follows the shared ratios", () => {
  assert.deepEqual(generalGameWordDifficultyWeights.easy, { easy: 1, normal: 0, hard: 0 });
  assert.deepEqual(generalGameWordDifficultyWeights.normal, { easy: 0.2, normal: 0.8, hard: 0 });
  assert.deepEqual(generalGameWordDifficultyWeights.hard, { easy: 0.1, normal: 0.4, hard: 0.5 });
  assert.equal(pickGeneralGameWordBand("normal", () => 0.19), "easy");
  assert.equal(pickGeneralGameWordBand("normal", () => 0.2), "normal");
  assert.equal(pickGeneralGameWordBand("hard", () => 0.09), "easy");
  assert.equal(pickGeneralGameWordBand("hard", () => 0.1), "normal");
  assert.equal(pickGeneralGameWordBand("hard", () => 0.5), "hard");
});

test("planned bands are selected without duplicate words", () => {
  const selected = selectGeneralGameWordsForBands({
    easy: ["猫", "犬"],
    normal: ["宇宙", "図書館"],
    hard: ["相対性理論"],
  }, ["easy", "normal", "hard"], () => 0);
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected).size, 3);
  assert.ok(["猫", "犬"].includes(selected[0]));
  assert.ok(["宇宙", "図書館"].includes(selected[1]));
  assert.equal(selected[2], "相対性理論");
});

test("daily history is separated by JST day and game", () => {
  const beforeMidnightUtc = Date.parse("2026-07-19T14:59:59.000Z");
  const afterMidnightUtc = Date.parse("2026-07-19T15:00:00.000Z");
  assert.equal(generalGameWordHistoryTokyoDay(beforeMidnightUtc), "2026-07-19");
  assert.equal(generalGameWordHistoryTokyoDay(afterMidnightUtc), "2026-07-20");
  assert.notEqual(
    generalGameWordDailyHistoryKey("nigoichi", "player-1", afterMidnightUtc),
    generalGameWordDailyHistoryKey("code-intercept", "player-1", afterMidnightUtc),
  );
});
