import assert from "node:assert/strict";
import test from "node:test";
import {
  tahoiyaDifficultyCriterionDescription,
  tahoiyaCandidateSurfaceAllowed,
  tahoiyaDifficultyLabel,
} from "../lib/tahoiya-difficulty.ts";

test("内部難易度を秘境と魔境の表示名へ変換する", () => {
  assert.equal(tahoiyaDifficultyLabel("standard"), "秘境");
  assert.equal(tahoiyaDifficultyLabel("extreme"), "魔境");
  assert.equal(tahoiyaDifficultyCriterionDescription("standard"), "推定認知率 1%超〜14%");
  assert.equal(tahoiyaDifficultyCriterionDescription("extreme"), "推定認知率 0〜1%");
});

test("四字熟語を文字数や品詞だけでたほい屋候補から除外しない", () => {
  assert.equal(Array.from("臥薪嘗胆").length, 4);
  assert.equal(tahoiyaCandidateSurfaceAllowed("臥薪嘗胆"), true);
  assert.equal(tahoiyaCandidateSurfaceAllowed("魑魅魍魎"), true);
  assert.equal(tahoiyaCandidateSurfaceAllowed("　"), false);
});
