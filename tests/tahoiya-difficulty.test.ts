import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesTahoiyaEffectiveZipf,
  tahoiyaDifficultyLabel,
  tahoiyaEffectiveZipfDescription,
  tahoiyaEffectiveZipfQuery,
} from "../lib/tahoiya-difficulty.ts";

test("秘境は0より大きく3未満の実質Zipfだけを選ぶ", () => {
  assert.equal(matchesTahoiyaEffectiveZipf(0, "standard"), false);
  assert.equal(matchesTahoiyaEffectiveZipf(0.01, "standard"), true);
  assert.equal(matchesTahoiyaEffectiveZipf(2.9, "standard"), true);
  assert.equal(matchesTahoiyaEffectiveZipf(3, "standard"), false);
  assert.equal(matchesTahoiyaEffectiveZipf(null, "standard"), false);
  assert.deepEqual(tahoiyaEffectiveZipfQuery("standard"), {
    effectiveZipfMinExclusive: 0,
    effectiveZipfMaxExclusive: 3,
  });
});

test("魔境は実質Zipfが0の語だけを選ぶ", () => {
  assert.equal(matchesTahoiyaEffectiveZipf(0, "extreme"), true);
  assert.equal(matchesTahoiyaEffectiveZipf(0.01, "extreme"), false);
  assert.equal(matchesTahoiyaEffectiveZipf(-0.01, "extreme"), false);
  assert.equal(matchesTahoiyaEffectiveZipf(null, "extreme"), false);
  assert.deepEqual(tahoiyaEffectiveZipfQuery("extreme"), { effectiveZipfEquals: 0 });
});

test("内部難易度を秘境と魔境の表示名へ変換する", () => {
  assert.equal(tahoiyaDifficultyLabel("standard"), "秘境");
  assert.equal(tahoiyaDifficultyLabel("extreme"), "魔境");
  assert.equal(tahoiyaEffectiveZipfDescription("standard"), "0 < 実質Zipf < 3");
  assert.equal(tahoiyaEffectiveZipfDescription("extreme"), "実質Zipf = 0");
});
