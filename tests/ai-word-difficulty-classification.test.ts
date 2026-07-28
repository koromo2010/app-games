import assert from "node:assert/strict";
import test from "node:test";
import { parseAiWordDifficultyClassificationInput } from "../lib/ai-word-difficulty-classification.ts";

test("difficulty classification accepts category defaults and exceptions", () => {
  const input = parseAiWordDifficultyClassificationInput({
    schemaVersion: 1,
    classificationKey: "general-difficulty-v1-001",
    classifiedBy: "codex",
    model: "gpt-test",
    rubricVersion: "school-stage-v1",
    categories: [{
      categoryKey: "food_meals",
      defaultClassification: {
        difficulty: "easy",
        confidence: 0.9,
        reason: "小学生にも広く知られている",
      },
      exceptions: [{
        surface: "茶碗蒸し",
        difficulty: "normal",
        confidence: 0.7,
        reason: "高校卒業までには一般に理解できる",
      }],
    }],
  });
  assert.equal(input.categories[0]?.defaultClassification.difficulty, "easy");
  assert.equal(input.categories[0]?.exceptions[0]?.difficulty, "normal");
});

test("difficulty classification rejects invalid confidence", () => {
  assert.throws(() => parseAiWordDifficultyClassificationInput({
    schemaVersion: 1,
    classificationKey: "general-difficulty-v1-invalid",
    classifiedBy: "codex",
    model: "gpt-test",
    rubricVersion: "school-stage-v1",
    categories: [{
      categoryKey: "food_meals",
      defaultClassification: {
        difficulty: "easy",
        confidence: 1.5,
        reason: "小学生にも広く知られている",
      },
      exceptions: [],
    }],
  }), /AI_WORD_CLASSIFICATION_INVALID/);
});
