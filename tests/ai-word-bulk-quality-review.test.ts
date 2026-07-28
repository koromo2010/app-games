import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesAiWordBulkQualityTarget,
  parseAiWordBulkQualityReviewInput,
} from "../lib/ai-word-bulk-quality-review.ts";

const input = {
  schemaVersion: 1,
  reviewKey: "general-quality-v2-all-001",
  reviewedBy: "codex",
  model: "gpt-test",
  policyVersion: "general-word-quality-v4",
  expectedCount: 1200,
  defaultDecision: "approved",
  defaultReason: "現代日本語の一般名詞として自然",
  generationBatchPrefixes: ["general-v2-"],
  exceptions: [{
    surface: "音楽録音",
    decision: "rejected",
    flags: ["unnatural_compound"],
    reason: "一般的な単独語として不自然",
  }],
} as const;

test("bulk quality review parses a whole generation series", () => {
  const review = parseAiWordBulkQualityReviewInput(input);
  assert.equal(review.expectedCount, 1200);
  assert.equal(review.exceptions[0]?.decision, "rejected");
});

test("bulk quality target includes supplements with the same prefix", () => {
  const review = parseAiWordBulkQualityReviewInput(input);
  assert.equal(matchesAiWordBulkQualityTarget(review, "general-v2-001"), true);
  assert.equal(
    matchesAiWordBulkQualityTarget(review, "general-v2-001-supplement-01"),
    true,
  );
  assert.equal(matchesAiWordBulkQualityTarget(review, "general-v1-010"), false);
});

test("bulk quality review rejects duplicate normalized exceptions", () => {
  assert.throws(() => parseAiWordBulkQualityReviewInput({
    ...input,
    exceptions: [
      ...input.exceptions,
      { ...input.exceptions[0], surface: " 音楽録音 " },
    ],
  }), /AI_WORD_BULK_QUALITY_REVIEW_DUPLICATE_EXCEPTION/);
});
