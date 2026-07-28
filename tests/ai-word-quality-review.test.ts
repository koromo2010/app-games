import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAiWordQualityPolicy,
  isKatakanaOnlyWord,
  parseAiWordQualityReviewInput,
} from "../lib/ai-word-quality-review.ts";

test("quality review accepts category defaults and explicit exceptions", () => {
  const review = parseAiWordQualityReviewInput({
    schemaVersion: 1,
    reviewKey: "general-quality-v1-001",
    reviewedBy: "codex",
    model: "gpt-test",
    policyVersion: "general-word-quality-v1",
    defaultDecision: "approved",
    defaultReason: "一般語として利用できる",
    categories: [{
      categoryKey: "food_meals",
      exceptions: [{
        surface: "そば",
        decision: "review",
        flags: ["polysemy"],
        reason: "複数の一般的な意味がある",
      }],
    }],
  });

  assert.equal(review.categories[0]?.exceptions[0]?.decision, "review");
  assert.deepEqual(review.categories[0]?.exceptions[0]?.flags, ["polysemy"]);
});

test("quality review rejects unknown categories", () => {
  assert.throws(() => parseAiWordQualityReviewInput({
    schemaVersion: 1,
    reviewKey: "general-quality-v1-invalid",
    reviewedBy: "codex",
    model: "gpt-test",
    policyVersion: "general-word-quality-v1",
    defaultDecision: "approved",
    defaultReason: "一般語として利用できる",
    categories: [{ categoryKey: "unknown", exceptions: [] }],
  }), /AI_WORD_REVIEW_UNKNOWN_CATEGORY/);
});

test("quality policy approves katakana words even when proposed for review", () => {
  assert.equal(isKatakanaOnlyWord("シェイク"), true);
  assert.equal(isKatakanaOnlyWord("桃"), false);
  assert.deepEqual(
    applyAiWordQualityPolicy("ソース", {
      decision: "review",
      flags: ["polysemy"],
      reason: "複数の意味がある",
    }),
    {
      decision: "approved",
      flags: [],
      reason: "多少の多義性を許容し、カタカナ一般語として承認する",
    },
  );
});

test("quality policy keeps the proposed result for non-katakana words", () => {
  const proposed = {
    decision: "review" as const,
    flags: ["polysemy"],
    reason: "複数の意味がある",
  };
  assert.deepEqual(applyAiWordQualityPolicy("もも", proposed), proposed);
});
