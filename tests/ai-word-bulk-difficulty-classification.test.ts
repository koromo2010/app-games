import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesAiWordBulkDifficultyTarget,
  parseAiWordBulkDifficultyClassificationInput,
} from "../lib/ai-word-bulk-difficulty-classification.ts";

const input = {
  schemaVersion: 1,
  classificationKey: "general-difficulty-v2-all-001",
  classifiedBy: "codex",
  model: "gpt-test",
  rubricVersion: "school-stage-v2-bulk",
  expectedCount: 1199,
  generationBatchPrefixes: ["general-v2-"],
  defaultClassification: {
    difficulty: "normal",
    confidence: 0.82,
    reason: "高校卒業までの一般知識で意味を説明できる",
  },
  categoryDefaults: [{
    categoryKey: "sports",
    classification: {
      difficulty: "easy",
      confidence: 0.9,
      reason: "小学6年生が日常や学校生活で意味を説明できる",
    },
  }],
  exceptions: [{
    surface: "スポーツマンシップ",
    difficulty: "normal",
    confidence: 0.86,
    reason: "概念の説明には高校卒業程度の理解を要する",
  }],
} as const;

test("bulk difficulty classification accepts global and category defaults", () => {
  const classification = parseAiWordBulkDifficultyClassificationInput(input);
  assert.equal(classification.expectedCount, 1199);
  assert.equal(classification.categoryDefaults[0]?.classification.difficulty, "easy");
});

test("bulk difficulty target includes a whole generation series", () => {
  const classification = parseAiWordBulkDifficultyClassificationInput(input);
  assert.equal(matchesAiWordBulkDifficultyTarget(classification, "general-v2-010"), true);
  assert.equal(matchesAiWordBulkDifficultyTarget(classification, "general-v1-010"), false);
});

test("bulk difficulty classification rejects an unknown category", () => {
  assert.throws(() => parseAiWordBulkDifficultyClassificationInput({
    ...input,
    categoryDefaults: [{
      ...input.categoryDefaults[0],
      categoryKey: "unknown_category",
    }],
  }), /AI_WORD_BULK_CLASSIFICATION_UNKNOWN_CATEGORY/);
});
