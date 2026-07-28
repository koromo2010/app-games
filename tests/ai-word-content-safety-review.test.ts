import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesAiWordContentSafetyTarget,
  parseAiWordContentSafetyReviewInput,
} from "../lib/ai-word-content-safety-review.ts";

const input = {
  schemaVersion: 1,
  reviewKey: "general-content-safety-v1",
  reviewedBy: "codex",
  model: "gpt-test",
  policyVersion: "ai-general-content-safety-v1",
  expectedCount: 2699,
  defaultDecision: "clean",
  defaultReason: "一般的な単語として利用可能",
  targetRules: [
    { generationBatchPrefix: "general-v1-", qualityStatuses: ["approved"] },
    { generationBatchPrefix: "general-v2-" },
  ],
  exceptions: [{
    surface: "戦争",
    decision: "review",
    flags: ["violence_conflict"],
    reason: "対立や被害を想起させるため利用文脈を確認する",
  }],
} as const;

test("content safety review parses targets and exceptions", () => {
  const review = parseAiWordContentSafetyReviewInput(input);
  assert.equal(review.expectedCount, 2699);
  assert.equal(review.exceptions[0]?.decision, "review");
  assert.deepEqual(review.exceptions[0]?.flags, ["violence_conflict"]);
});

test("content safety target can combine approved v1 and all v2 candidates", () => {
  const review = parseAiWordContentSafetyReviewInput(input);
  assert.equal(matchesAiWordContentSafetyTarget(review, {
    generationBatchKey: "general-v1-001",
    qualityStatus: "approved",
  }), true);
  assert.equal(matchesAiWordContentSafetyTarget(review, {
    generationBatchKey: "general-v1-001",
    qualityStatus: "rejected",
  }), false);
  assert.equal(matchesAiWordContentSafetyTarget(review, {
    generationBatchKey: "general-v2-001",
    qualityStatus: "unreviewed",
  }), true);
});

test("content safety review rejects duplicate normalized exceptions", () => {
  assert.throws(() => parseAiWordContentSafetyReviewInput({
    ...input,
    exceptions: [
      ...input.exceptions,
      { ...input.exceptions[0], surface: " 戦争 " },
    ],
  }), /AI_WORD_CONTENT_SAFETY_REVIEW_DUPLICATE_EXCEPTION/);
});
