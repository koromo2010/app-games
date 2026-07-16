import assert from "node:assert/strict";
import test from "node:test";

import {
  commonEffectiveZipf,
  defaultWordSelectionHyperparameters,
  feedbackAdjustmentFromCounts,
  gameEffectiveZipf,
  normalizeWordDifficulty,
  wordSelectionWeight,
} from "../lib/word-selection-protocol.ts";

test("shared word difficulty centers are hyperparameters", () => {
  assert.equal(defaultWordSelectionHyperparameters.batchSize, 3);
  assert.equal(defaultWordSelectionHyperparameters.difficulties.easy.targetZipf, 6);
  assert.equal(defaultWordSelectionHyperparameters.difficulties.normal.targetZipf, 5);
  assert.equal(defaultWordSelectionHyperparameters.difficulties.hard.targetZipf, 4);
  assert.equal(normalizeWordDifficulty("unexpected"), "normal");
});

test("common and game penalties remain separate", () => {
  assert.equal(commonEffectiveZipf({ zipfFrequency: 6, usagePenalty: 0.5, feedbackAdjustment: 0.2 }), 5.7);
  assert.equal(gameEffectiveZipf({ zipfFrequency: 6, usagePenalty: 0.5, gamePenalty: 1, feedbackAdjustment: 0.2 }), 4.7);
});

test("selection weight peaks at the configured difficulty center", () => {
  const center = wordSelectionWeight(6, "easy");
  assert.equal(center, 1);
  assert.ok(wordSelectionWeight(5.5, "easy") < center);
  assert.ok(wordSelectionWeight(4, "easy") < 0.001);
});

test("feedback requires samples and remains bounded", () => {
  assert.equal(feedbackAdjustmentFromCounts(4, 0), 0);
  assert.ok(feedbackAdjustmentFromCounts(20, 0) > 0);
  assert.ok(feedbackAdjustmentFromCounts(0, 20) < 0);
  assert.ok(Math.abs(feedbackAdjustmentFromCounts(1000, 0)) <= 0.5);
});
