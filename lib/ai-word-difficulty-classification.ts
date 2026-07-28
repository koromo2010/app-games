import { normalizeAiWordSurface } from "./ai-word-candidate-batch.ts";
import { getGeneralWordGenre } from "./general-word-genres.ts";

export type AiWordDifficulty = "easy" | "normal" | "hard";

export type AiWordDifficultyJudgment = {
  difficulty: AiWordDifficulty;
  confidence: number;
  reason: string;
};

export type AiWordDifficultyClassificationInput = {
  schemaVersion: 1;
  classificationKey: string;
  classifiedBy: string;
  model: string;
  rubricVersion: string;
  categories: Array<{
    categoryKey: string;
    defaultClassification: AiWordDifficultyJudgment;
    exceptions: Array<AiWordDifficultyJudgment & { surface: string }>;
  }>;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

function parseJudgment(value: unknown, context: string): AiWordDifficultyJudgment {
  if (!value || typeof value !== "object") throw new Error(`AI_WORD_CLASSIFICATION_INVALID:${context}`);
  const source = value as Partial<AiWordDifficultyJudgment>;
  const reason = cleanString(source.reason);
  if (
    (source.difficulty !== "easy" && source.difficulty !== "normal" && source.difficulty !== "hard")
    || typeof source.confidence !== "number"
    || !Number.isFinite(source.confidence)
    || source.confidence < 0
    || source.confidence > 1
    || reason.length < 5
    || reason.length > 240
  ) {
    throw new Error(`AI_WORD_CLASSIFICATION_INVALID:${context}`);
  }
  return { difficulty: source.difficulty, confidence: source.confidence, reason };
}

export function parseAiWordDifficultyClassificationInput(
  value: unknown,
): AiWordDifficultyClassificationInput {
  if (!value || typeof value !== "object") throw new Error("AI_WORD_CLASSIFICATION_OBJECT_REQUIRED");
  const source = value as Partial<AiWordDifficultyClassificationInput>;
  if (source.schemaVersion !== 1) throw new Error("AI_WORD_CLASSIFICATION_SCHEMA_VERSION_UNSUPPORTED");

  const classificationKey = cleanString(source.classificationKey);
  const classifiedBy = cleanString(source.classifiedBy);
  const model = cleanString(source.model);
  const rubricVersion = cleanString(source.rubricVersion);
  if (!classificationKey || !classifiedBy || !model || !rubricVersion) {
    throw new Error("AI_WORD_CLASSIFICATION_METADATA_REQUIRED");
  }
  if (!Array.isArray(source.categories) || source.categories.length === 0) {
    throw new Error("AI_WORD_CLASSIFICATION_CATEGORIES_REQUIRED");
  }

  const seenCategories = new Set<string>();
  const categories = source.categories.map((category) => {
    const categoryKey = cleanString(category?.categoryKey);
    if (!getGeneralWordGenre(categoryKey)) {
      throw new Error(`AI_WORD_CLASSIFICATION_UNKNOWN_CATEGORY:${categoryKey}`);
    }
    if (seenCategories.has(categoryKey)) {
      throw new Error(`AI_WORD_CLASSIFICATION_DUPLICATE_CATEGORY:${categoryKey}`);
    }
    seenCategories.add(categoryKey);
    const defaultClassification = parseJudgment(
      category.defaultClassification,
      `${categoryKey}:default`,
    );
    if (!Array.isArray(category.exceptions)) {
      throw new Error(`AI_WORD_CLASSIFICATION_EXCEPTIONS_REQUIRED:${categoryKey}`);
    }
    const seenSurfaces = new Set<string>();
    const exceptions = category.exceptions.map((exception) => {
      const surface = cleanString(exception?.surface);
      const normalized = normalizeAiWordSurface(surface);
      if (!surface || seenSurfaces.has(normalized)) {
        throw new Error(`AI_WORD_CLASSIFICATION_DUPLICATE_EXCEPTION:${categoryKey}:${surface}`);
      }
      seenSurfaces.add(normalized);
      return {
        surface,
        ...parseJudgment(exception, `${categoryKey}:${surface}`),
      };
    });
    return { categoryKey, defaultClassification, exceptions };
  });

  return {
    schemaVersion: 1,
    classificationKey,
    classifiedBy,
    model,
    rubricVersion,
    categories,
  };
}
