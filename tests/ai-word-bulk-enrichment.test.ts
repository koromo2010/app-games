import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesAiWordBulkEnrichmentTarget,
  parseAiWordBulkEnrichmentInput,
} from "../lib/ai-word-bulk-enrichment.ts";

const input = {
  schemaVersion: 1,
  enrichmentKey: "ai-general-enrichment-v2-all-001",
  enrichedBy: "codex",
  model: "gpt-test",
  policyVersion: "ai-general-enrichment-v2",
  lexicalSourceVersion: "sudachidict-core-fixed+jmdict-local-fallback",
  expectedCount: 89,
  generationBatchPrefixes: ["general-v2-"],
} as const;

test("bulk enrichment parses local-only target metadata", () => {
  const enrichment = parseAiWordBulkEnrichmentInput(input);
  assert.equal(enrichment.expectedCount, 89);
  assert.equal(enrichment.generationBatchPrefixes[0], "general-v2-");
});

test("bulk enrichment targets supplements in the same generation", () => {
  const enrichment = parseAiWordBulkEnrichmentInput(input);
  assert.equal(matchesAiWordBulkEnrichmentTarget(
    enrichment,
    "general-v2-001-supplement-01",
  ), true);
  assert.equal(matchesAiWordBulkEnrichmentTarget(enrichment, "general-v1-001"), false);
});

test("bulk enrichment rejects duplicate batch prefixes", () => {
  assert.throws(() => parseAiWordBulkEnrichmentInput({
    ...input,
    generationBatchPrefixes: ["general-v2-", "general-v2-"],
  }), /AI_WORD_BULK_ENRICHMENT_BATCH_PREFIX_INVALID/);
});
