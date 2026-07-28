import { normalizeAiWordSurface } from "./ai-word-candidate-batch.ts";
import {
  parseAiWordDifficultyJudgment,
  type AiWordDifficultyJudgment,
} from "./ai-word-difficulty-classification.ts";
import { getGeneralWordGenre } from "./general-word-genres.ts";

export type AiWordBulkDifficultyClassificationInput = {
  schemaVersion: 1;
  classificationKey: string;
  classifiedBy: string;
  model: string;
  rubricVersion: string;
  expectedCount: number;
  generationBatchPrefixes: string[];
  defaultClassification: AiWordDifficultyJudgment;
  categoryDefaults: Array<{
    categoryKey: string;
    classification: AiWordDifficultyJudgment;
  }>;
  exceptions: Array<AiWordDifficultyJudgment & { surface: string }>;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";
}

export function parseAiWordBulkDifficultyClassificationInput(
  value: unknown,
): AiWordBulkDifficultyClassificationInput {
  if (!value || typeof value !== "object") {
    throw new Error("AI_WORD_BULK_CLASSIFICATION_OBJECT_REQUIRED");
  }
  const source = value as Partial<AiWordBulkDifficultyClassificationInput>;
  if (source.schemaVersion !== 1) {
    throw new Error("AI_WORD_BULK_CLASSIFICATION_SCHEMA_VERSION_UNSUPPORTED");
  }

  const classificationKey = cleanString(source.classificationKey);
  const classifiedBy = cleanString(source.classifiedBy);
  const model = cleanString(source.model);
  const rubricVersion = cleanString(source.rubricVersion);
  if (!classificationKey || !classifiedBy || !model || !rubricVersion) {
    throw new Error("AI_WORD_BULK_CLASSIFICATION_METADATA_REQUIRED");
  }
  if (!Number.isInteger(source.expectedCount) || Number(source.expectedCount) <= 0) {
    throw new Error("AI_WORD_BULK_CLASSIFICATION_EXPECTED_COUNT_INVALID");
  }
  if (!Array.isArray(source.generationBatchPrefixes) || source.generationBatchPrefixes.length === 0) {
    throw new Error("AI_WORD_BULK_CLASSIFICATION_BATCH_PREFIXES_REQUIRED");
  }
  const generationBatchPrefixes = [
    ...new Set(source.generationBatchPrefixes.map(cleanString).filter(Boolean)),
  ];
  if (generationBatchPrefixes.length !== source.generationBatchPrefixes.length) {
    throw new Error("AI_WORD_BULK_CLASSIFICATION_BATCH_PREFIX_INVALID");
  }
  const defaultClassification = parseAiWordDifficultyJudgment(
    source.defaultClassification,
    "bulk:default",
  );

  if (!Array.isArray(source.categoryDefaults)) {
    throw new Error("AI_WORD_BULK_CLASSIFICATION_CATEGORY_DEFAULTS_REQUIRED");
  }
  const seenCategories = new Set<string>();
  const categoryDefaults = source.categoryDefaults.map((item) => {
    const categoryKey = cleanString(item?.categoryKey);
    if (!getGeneralWordGenre(categoryKey)) {
      throw new Error(`AI_WORD_BULK_CLASSIFICATION_UNKNOWN_CATEGORY:${categoryKey}`);
    }
    if (seenCategories.has(categoryKey)) {
      throw new Error(`AI_WORD_BULK_CLASSIFICATION_DUPLICATE_CATEGORY:${categoryKey}`);
    }
    seenCategories.add(categoryKey);
    return {
      categoryKey,
      classification: parseAiWordDifficultyJudgment(
        item.classification,
        `bulk:${categoryKey}`,
      ),
    };
  });

  if (!Array.isArray(source.exceptions)) {
    throw new Error("AI_WORD_BULK_CLASSIFICATION_EXCEPTIONS_REQUIRED");
  }
  const seenSurfaces = new Set<string>();
  const exceptions = source.exceptions.map((item) => {
    const surface = cleanString(item?.surface);
    const normalized = normalizeAiWordSurface(surface);
    if (!normalized || seenSurfaces.has(normalized)) {
      throw new Error(`AI_WORD_BULK_CLASSIFICATION_DUPLICATE_EXCEPTION:${surface}`);
    }
    seenSurfaces.add(normalized);
    return {
      surface,
      ...parseAiWordDifficultyJudgment(item, `bulk:${surface}`),
    };
  });

  return {
    schemaVersion: 1,
    classificationKey,
    classifiedBy,
    model,
    rubricVersion,
    expectedCount: Number(source.expectedCount),
    generationBatchPrefixes,
    defaultClassification,
    categoryDefaults,
    exceptions,
  };
}

export function matchesAiWordBulkDifficultyTarget(
  classification: AiWordBulkDifficultyClassificationInput,
  generationBatchKey: string,
) {
  return classification.generationBatchPrefixes.some(
    (prefix) => generationBatchKey.startsWith(prefix),
  );
}
