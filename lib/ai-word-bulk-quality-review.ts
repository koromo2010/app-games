import { normalizeAiWordSurface } from "./ai-word-candidate-batch.ts";
import type { AiWordQualityDecision } from "./ai-word-quality-review.ts";

export type AiWordBulkQualityReviewInput = {
  schemaVersion: 1;
  reviewKey: string;
  reviewedBy: string;
  model: string;
  policyVersion: string;
  expectedCount: number;
  defaultDecision: AiWordQualityDecision;
  defaultReason: string;
  generationBatchPrefixes: string[];
  exceptions: Array<{
    surface: string;
    decision: AiWordQualityDecision;
    flags: string[];
    reason: string;
  }>;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

function isDecision(value: unknown): value is AiWordQualityDecision {
  return value === "approved" || value === "review" || value === "rejected";
}

export function parseAiWordBulkQualityReviewInput(
  value: unknown,
): AiWordBulkQualityReviewInput {
  if (!value || typeof value !== "object") {
    throw new Error("AI_WORD_BULK_QUALITY_REVIEW_OBJECT_REQUIRED");
  }
  const source = value as Partial<AiWordBulkQualityReviewInput>;
  if (source.schemaVersion !== 1) {
    throw new Error("AI_WORD_BULK_QUALITY_REVIEW_SCHEMA_VERSION_UNSUPPORTED");
  }

  const reviewKey = cleanString(source.reviewKey);
  const reviewedBy = cleanString(source.reviewedBy);
  const model = cleanString(source.model);
  const policyVersion = cleanString(source.policyVersion);
  const defaultReason = cleanString(source.defaultReason);
  if (!reviewKey || !reviewedBy || !model || !policyVersion || !defaultReason) {
    throw new Error("AI_WORD_BULK_QUALITY_REVIEW_METADATA_REQUIRED");
  }
  if (!Number.isInteger(source.expectedCount) || Number(source.expectedCount) <= 0) {
    throw new Error("AI_WORD_BULK_QUALITY_REVIEW_EXPECTED_COUNT_INVALID");
  }
  if (!isDecision(source.defaultDecision)) {
    throw new Error("AI_WORD_BULK_QUALITY_REVIEW_DEFAULT_DECISION_INVALID");
  }
  if (!Array.isArray(source.generationBatchPrefixes) || source.generationBatchPrefixes.length === 0) {
    throw new Error("AI_WORD_BULK_QUALITY_REVIEW_BATCH_PREFIXES_REQUIRED");
  }
  const generationBatchPrefixes = [
    ...new Set(source.generationBatchPrefixes.map(cleanString).filter(Boolean)),
  ];
  if (generationBatchPrefixes.length !== source.generationBatchPrefixes.length) {
    throw new Error("AI_WORD_BULK_QUALITY_REVIEW_BATCH_PREFIX_INVALID");
  }

  if (!Array.isArray(source.exceptions)) {
    throw new Error("AI_WORD_BULK_QUALITY_REVIEW_EXCEPTIONS_REQUIRED");
  }
  const seenSurfaces = new Set<string>();
  const exceptions = source.exceptions.map((exception) => {
    const surface = cleanString(exception?.surface);
    const normalized = normalizeAiWordSurface(surface);
    const reason = cleanString(exception?.reason);
    if (!normalized || !reason || !isDecision(exception?.decision)) {
      throw new Error("AI_WORD_BULK_QUALITY_REVIEW_EXCEPTION_INVALID");
    }
    if (seenSurfaces.has(normalized)) {
      throw new Error(`AI_WORD_BULK_QUALITY_REVIEW_DUPLICATE_EXCEPTION:${surface}`);
    }
    seenSurfaces.add(normalized);
    const flags = Array.isArray(exception.flags)
      ? [...new Set(exception.flags.map(cleanString).filter(Boolean))]
      : [];
    return { surface, decision: exception.decision, flags, reason };
  });

  return {
    schemaVersion: 1,
    reviewKey,
    reviewedBy,
    model,
    policyVersion,
    expectedCount: Number(source.expectedCount),
    defaultDecision: source.defaultDecision,
    defaultReason,
    generationBatchPrefixes,
    exceptions,
  };
}

export function matchesAiWordBulkQualityTarget(
  review: AiWordBulkQualityReviewInput,
  generationBatchKey: string,
) {
  return review.generationBatchPrefixes.some((prefix) => generationBatchKey.startsWith(prefix));
}
