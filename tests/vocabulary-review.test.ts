import assert from "node:assert/strict";
import test from "node:test";
import { resolveVocabularyEvaluationDecision } from "../lib/vocabulary-review.ts";

test("human vote majority overrides the LLM evaluation", () => {
  assert.equal(resolveVocabularyEvaluationDecision("reject", 1, 0), "accept");
  assert.equal(resolveVocabularyEvaluationDecision("accept", 0, 1), "reject");
});

test("a tied or empty human vote falls back to the LLM evaluation", () => {
  assert.equal(resolveVocabularyEvaluationDecision("accept", 0, 0), "accept");
  assert.equal(resolveVocabularyEvaluationDecision("reject", 2, 2), "reject");
});
