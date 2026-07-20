import assert from "node:assert/strict";
import test from "node:test";
import {
  tahoiyaDifficultyCriterionDescription,
  tahoiyaDifficultyLabel,
} from "../lib/tahoiya-difficulty.ts";

test("内部難易度を秘境と魔境の表示名へ変換する", () => {
  assert.equal(tahoiyaDifficultyLabel("standard"), "秘境");
  assert.equal(tahoiyaDifficultyLabel("extreme"), "魔境");
  assert.equal(tahoiyaDifficultyCriterionDescription("standard"), "推定認知率 1%超〜14%");
  assert.equal(tahoiyaDifficultyCriterionDescription("extreme"), "推定認知率 0〜1%");
});
