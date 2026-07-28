import { getGeneralWordGenre } from "./general-word-genres.ts";

export type AiWordCandidateInput = {
  surface: string;
  reading: string;
};

export type AiWordCategoryBatchInput = {
  categoryKey: string;
  words: AiWordCandidateInput[];
};

export type AiWordBatchInput = {
  schemaVersion: 1;
  batchKey: string;
  generatedBy: string;
  model: string;
  promptVersion: string;
  categories: AiWordCategoryBatchInput[];
};

export type ValidatedAiWordCandidate = AiWordCandidateInput & {
  normalizedForm: string;
  categoryKey: string;
};

export type RejectedAiWordCandidate = {
  categoryKey: string;
  surface: string;
  reason: string;
};

const japaneseSurfacePattern =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ]+$/u;
const hiraganaReadingPattern = /^[\p{Script=Hiragana}ー]+$/u;

function cleanString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeAiWordSurface(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").trim().toLocaleLowerCase("ja");
}

export function parseAiWordBatchInput(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("AI_WORD_BATCH_OBJECT_REQUIRED");
  }
  const source = value as Partial<AiWordBatchInput>;
  if (source.schemaVersion !== 1) throw new Error("AI_WORD_BATCH_SCHEMA_VERSION_UNSUPPORTED");

  const batchKey = cleanString(source.batchKey);
  const generatedBy = cleanString(source.generatedBy);
  const model = cleanString(source.model);
  const promptVersion = cleanString(source.promptVersion);
  if (!batchKey || !generatedBy || !model || !promptVersion) {
    throw new Error("AI_WORD_BATCH_METADATA_REQUIRED");
  }
  if (batchKey.length > 120 || generatedBy.length > 80 || model.length > 120 || promptVersion.length > 120) {
    throw new Error("AI_WORD_BATCH_METADATA_TOO_LONG");
  }
  if (!Array.isArray(source.categories) || source.categories.length === 0) {
    throw new Error("AI_WORD_BATCH_CATEGORIES_REQUIRED");
  }

  const accepted: ValidatedAiWordCandidate[] = [];
  const rejected: RejectedAiWordCandidate[] = [];
  const seen = new Set<string>();
  const categoryKeys = new Set<string>();

  for (const rawCategory of source.categories) {
    if (!rawCategory || typeof rawCategory !== "object") {
      throw new Error("AI_WORD_BATCH_CATEGORY_OBJECT_REQUIRED");
    }
    const categoryKey = cleanString(rawCategory.categoryKey);
    if (!getGeneralWordGenre(categoryKey)) {
      throw new Error(`AI_WORD_BATCH_UNKNOWN_CATEGORY:${categoryKey}`);
    }
    if (categoryKeys.has(categoryKey)) {
      throw new Error(`AI_WORD_BATCH_DUPLICATE_CATEGORY:${categoryKey}`);
    }
    categoryKeys.add(categoryKey);
    if (!Array.isArray(rawCategory.words) || rawCategory.words.length === 0 || rawCategory.words.length > 30) {
      throw new Error(`AI_WORD_BATCH_WORD_COUNT_INVALID:${categoryKey}`);
    }

    for (const rawWord of rawCategory.words) {
      const surface = cleanString(rawWord?.surface);
      const reading = cleanString(rawWord?.reading).replace(/\s+/g, "");
      const normalizedForm = normalizeAiWordSurface(surface);
      let reason = "";
      if ([...surface].length < 2) reason = "surface_too_short";
      else if ([...surface].length > 24) reason = "surface_too_long";
      else if (!japaneseSurfacePattern.test(surface)) reason = "surface_not_japanese";
      else if ([...reading].length > 40) reason = "reading_too_long";
      else if (!hiraganaReadingPattern.test(reading)) reason = "reading_not_hiragana";
      else if (seen.has(normalizedForm)) reason = "duplicate_in_batch";

      if (reason) {
        rejected.push({ categoryKey, surface, reason });
        continue;
      }
      seen.add(normalizedForm);
      accepted.push({ categoryKey, surface, reading, normalizedForm });
    }
  }

  return {
    batch: {
      schemaVersion: 1 as const,
      batchKey,
      generatedBy,
      model,
      promptVersion,
      categories: source.categories,
    },
    categoryKeys: [...categoryKeys],
    accepted,
    rejected,
  };
}
