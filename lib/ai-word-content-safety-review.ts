import { normalizeAiWordSurface } from "./ai-word-candidate-batch.ts";

export type AiWordContentSafetyDecision = "clean" | "review" | "exclude";

export type AiWordContentSafetyReviewInput = {
  schemaVersion: 1;
  reviewKey: string;
  reviewedBy: string;
  model: string;
  policyVersion: string;
  expectedCount: number;
  defaultDecision: AiWordContentSafetyDecision;
  defaultReason: string;
  targetRules: Array<{
    generationBatchPrefix: string;
    qualityStatuses?: Array<"unreviewed" | "approved" | "review" | "rejected">;
  }>;
  exceptions: Array<{
    surface: string;
    decision: AiWordContentSafetyDecision;
    flags: string[];
    reason: string;
  }>;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

function isDecision(value: unknown): value is AiWordContentSafetyDecision {
  return value === "clean" || value === "review" || value === "exclude";
}

function isQualityStatus(value: unknown): value is "unreviewed" | "approved" | "review" | "rejected" {
  return value === "unreviewed" || value === "approved" || value === "review" || value === "rejected";
}

export function parseAiWordContentSafetyReviewInput(
  value: unknown,
): AiWordContentSafetyReviewInput {
  if (!value || typeof value !== "object") {
    throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_OBJECT_REQUIRED");
  }
  const source = value as Partial<AiWordContentSafetyReviewInput>;
  if (source.schemaVersion !== 1) {
    throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_SCHEMA_VERSION_UNSUPPORTED");
  }

  const reviewKey = cleanString(source.reviewKey);
  const reviewedBy = cleanString(source.reviewedBy);
  const model = cleanString(source.model);
  const policyVersion = cleanString(source.policyVersion);
  const defaultReason = cleanString(source.defaultReason);
  if (!reviewKey || !reviewedBy || !model || !policyVersion || !defaultReason) {
    throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_METADATA_REQUIRED");
  }
  if (!Number.isInteger(source.expectedCount) || Number(source.expectedCount) <= 0) {
    throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_EXPECTED_COUNT_INVALID");
  }
  if (!isDecision(source.defaultDecision)) {
    throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_DEFAULT_DECISION_INVALID");
  }
  if (!Array.isArray(source.targetRules) || source.targetRules.length === 0) {
    throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_TARGET_RULES_REQUIRED");
  }

  const seenPrefixes = new Set<string>();
  const targetRules = source.targetRules.map((rule) => {
    const generationBatchPrefix = cleanString(rule?.generationBatchPrefix);
    if (!generationBatchPrefix) {
      throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_BATCH_PREFIX_REQUIRED");
    }
    if (seenPrefixes.has(generationBatchPrefix)) {
      throw new Error(`AI_WORD_CONTENT_SAFETY_REVIEW_DUPLICATE_BATCH_PREFIX:${generationBatchPrefix}`);
    }
    seenPrefixes.add(generationBatchPrefix);
    if (rule.qualityStatuses !== undefined && !Array.isArray(rule.qualityStatuses)) {
      throw new Error(
        `AI_WORD_CONTENT_SAFETY_REVIEW_QUALITY_STATUSES_INVALID:${generationBatchPrefix}`,
      );
    }
    const qualityStatuses = rule.qualityStatuses === undefined
      ? undefined
      : [...new Set(rule.qualityStatuses)];
    if (qualityStatuses?.some((status) => !isQualityStatus(status))) {
      throw new Error(
        `AI_WORD_CONTENT_SAFETY_REVIEW_QUALITY_STATUS_INVALID:${generationBatchPrefix}`,
      );
    }
    return { generationBatchPrefix, qualityStatuses };
  });

  if (!Array.isArray(source.exceptions)) {
    throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_EXCEPTIONS_REQUIRED");
  }
  const seenSurfaces = new Set<string>();
  const exceptions = source.exceptions.map((exception) => {
    const surface = cleanString(exception?.surface);
    const normalized = normalizeAiWordSurface(surface);
    const reason = cleanString(exception?.reason);
    if (!normalized || !reason || !isDecision(exception?.decision)) {
      throw new Error("AI_WORD_CONTENT_SAFETY_REVIEW_EXCEPTION_INVALID");
    }
    if (seenSurfaces.has(normalized)) {
      throw new Error(`AI_WORD_CONTENT_SAFETY_REVIEW_DUPLICATE_EXCEPTION:${surface}`);
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
    targetRules,
    exceptions,
  };
}

export function matchesAiWordContentSafetyTarget(
  review: AiWordContentSafetyReviewInput,
  candidate: { generationBatchKey: string; qualityStatus: string },
) {
  return review.targetRules.some((rule) => (
    candidate.generationBatchKey.startsWith(rule.generationBatchPrefix)
    && (
      rule.qualityStatuses === undefined
      || rule.qualityStatuses.includes(
        candidate.qualityStatus as "unreviewed" | "approved" | "review" | "rejected",
      )
    )
  ));
}
