import assert from "node:assert/strict";
import test from "node:test";
import {
  commonEffectiveZipf,
  feedbackAdjustmentFromCounts,
  gameEffectiveZipf,
  normalizeWordDifficulty,
  wordSelectionWeight,
} from "../lib/word-selection-protocol.ts";

test("word difficulty defaults to normal", () => {
  assert.equal(normalizeWordDifficulty("easy"), "easy");
  assert.equal(normalizeWordDifficulty("hard"), "hard");
  assert.equal(normalizeWordDifficulty("unknown"), "normal");
});

test("common and game penalties are applied independently", () => {
  assert.equal(commonEffectiveZipf({ zipfFrequency: 5.5, usagePenalty: 0.5, feedbackAdjustment: 0.25 }), 5.25);
  assert.equal(gameEffectiveZipf({
    zipfFrequency: 5.5,
    usagePenalty: 0.5,
    gamePenalty: 1,
    feedbackAdjustment: 0.25,
  }), 4.25);
});

test("selection weight peaks at each difficulty target", () => {
  assert.equal(wordSelectionWeight(6, "easy"), 1);
  assert.equal(wordSelectionWeight(5, "normal"), 1);
  assert.equal(wordSelectionWeight(4, "hard"), 1);
  assert.ok(wordSelectionWeight(5.5, "normal") < 1);
  assert.ok(wordSelectionWeight(6, "normal") < wordSelectionWeight(5.5, "normal"));
});

test("feedback adjustment waits for enough samples and is bounded", () => {
  assert.equal(feedbackAdjustmentFromCounts(4, 0), 0);
  assert.equal(feedbackAdjustmentFromCounts(20, 0), 0.5);
  assert.equal(feedbackAdjustmentFromCounts(0, 20), -0.5);
  assert.equal(feedbackAdjustmentFromCounts(10, 10), 0);
});
