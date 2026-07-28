import { getGeneralWordGenre } from "./general-word-genres.ts";

export type AiWordQualityDecision = "approved" | "review" | "rejected";

export type AiWordQualityResult = {
  decision: AiWordQualityDecision;
  flags: string[];
  reason: string;
};

export type AiWordQualityReviewInput = {
  schemaVersion: 1;
  reviewKey: string;
  reviewedBy: string;
  model: string;
  policyVersion: string;
  defaultDecision: AiWordQualityDecision;
  defaultReason: string;
  categories: Array<{
    categoryKey: string;
    exceptions: Array<{
      surface: string;
      decision: AiWordQualityDecision;
      flags: string[];
      reason: string;
    }>;
  }>;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

function isDecision(value: unknown): value is AiWordQualityDecision {
  return value === "approved" || value === "review" || value === "rejected";
}

export function isKatakanaOnlyWord(surface: string) {
  const normalized = cleanString(surface);
  return normalized.length > 0 && /^[ァ-ヶヽヾー]+$/u.test(normalized);
}

export function applyAiWordQualityPolicy(
  surface: string,
  proposed: AiWordQualityResult,
): AiWordQualityResult {
  if (!isKatakanaOnlyWord(surface)) return proposed;
  return {
    decision: "approved",
    flags: [],
    reason: "多少の多義性を許容し、カタカナ一般語として承認する",
  };
}

export function parseAiWordQualityReviewInput(value: unknown): AiWordQualityReviewInput {
  if (!value || typeof value !== "object") throw new Error("AI_WORD_REVIEW_OBJECT_REQUIRED");
  const source = value as Partial<AiWordQualityReviewInput>;
  if (source.schemaVersion !== 1) throw new Error("AI_WORD_REVIEW_SCHEMA_VERSION_UNSUPPORTED");

  const reviewKey = cleanString(source.reviewKey);
  const reviewedBy = cleanString(source.reviewedBy);
  const model = cleanString(source.model);
  const policyVersion = cleanString(source.policyVersion);
  const defaultReason = cleanString(source.defaultReason);
  if (!reviewKey || !reviewedBy || !model || !policyVersion || !defaultReason) {
    throw new Error("AI_WORD_REVIEW_METADATA_REQUIRED");
  }
  if (!isDecision(source.defaultDecision)) throw new Error("AI_WORD_REVIEW_DEFAULT_DECISION_INVALID");
  if (!Array.isArray(source.categories) || source.categories.length === 0) {
    throw new Error("AI_WORD_REVIEW_CATEGORIES_REQUIRED");
  }

  const seenCategories = new Set<string>();
  const categories = source.categories.map((category) => {
    const categoryKey = cleanString(category?.categoryKey);
    if (!getGeneralWordGenre(categoryKey)) throw new Error(`AI_WORD_REVIEW_UNKNOWN_CATEGORY:${categoryKey}`);
    if (seenCategories.has(categoryKey)) throw new Error(`AI_WORD_REVIEW_DUPLICATE_CATEGORY:${categoryKey}`);
    seenCategories.add(categoryKey);
    if (!Array.isArray(category.exceptions)) {
      throw new Error(`AI_WORD_REVIEW_EXCEPTIONS_REQUIRED:${categoryKey}`);
    }

    const seenSurfaces = new Set<string>();
    const exceptions = category.exceptions.map((exception) => {
      const surface = cleanString(exception?.surface);
      const reason = cleanString(exception?.reason);
      if (!surface || !reason || !isDecision(exception?.decision)) {
        throw new Error(`AI_WORD_REVIEW_EXCEPTION_INVALID:${categoryKey}`);
      }
      if (seenSurfaces.has(surface)) {
        throw new Error(`AI_WORD_REVIEW_DUPLICATE_EXCEPTION:${categoryKey}:${surface}`);
      }
      seenSurfaces.add(surface);
      const flags = Array.isArray(exception.flags)
        ? [...new Set(exception.flags.map(cleanString).filter(Boolean))]
        : [];
      return { surface, decision: exception.decision, flags, reason };
    });
    return { categoryKey, exceptions };
  });

  return {
    schemaVersion: 1,
    reviewKey,
    reviewedBy,
    model,
    policyVersion,
    defaultDecision: source.defaultDecision,
    defaultReason,
    categories,
  };
}
