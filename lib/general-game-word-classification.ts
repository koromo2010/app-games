export const generalGameWordPoolKey = "standard-game" as const;
export const generalGameWordPoolFlag = "general_game_pool" as const;
export const generalGameWordDifficulties = ["easy", "normal", "hard"] as const;
export type GeneralGameWordDifficulty = (typeof generalGameWordDifficulties)[number];
export const generalGameWordDifficultyTags: Record<GeneralGameWordDifficulty, string> = {
  easy: "difficulty_easy",
  normal: "difficulty_normal",
  hard: "difficulty_hard",
} as const;

export const generalGameWordPoolSource = generalGameWordPoolFlag;

export type LegacyGeneralGameWordClassificationRow = {
  word_master_id: string | number;
  surface: string;
  reading: string | null;
  difficulty_tier: string | null;
  evaluation_flags: unknown;
};

export type GeneralGameWordClassificationImportRecord = {
  wordMasterId: number;
  surface: string;
  normalizedSurface: string;
  reading: string;
  difficulty: GeneralGameWordDifficulty;
};

export function isGeneralGameWordDifficulty(
  value: unknown,
): value is GeneralGameWordDifficulty {
  return generalGameWordDifficulties.includes(value as GeneralGameWordDifficulty);
}

export function normalizeLegacyGeneralGameWordClassifications(
  rows: readonly LegacyGeneralGameWordClassificationRow[],
) {
  const normalized = new Map<string, GeneralGameWordClassificationImportRecord>();
  for (const row of rows) {
    const wordMasterId = Number(row.word_master_id);
    const surface = String(row.surface ?? "").normalize("NFKC").trim();
    const reading = String(row.reading ?? "").normalize("NFKC").trim();
    const normalizedSurface = surface.toLocaleLowerCase("ja-JP");
    const difficulty = row.difficulty_tier;
    const flags = new Set(
      Array.isArray(row.evaluation_flags)
        ? row.evaluation_flags.filter((value): value is string => typeof value === "string")
        : [],
    );
    if (
      !Number.isSafeInteger(wordMasterId)
      || wordMasterId <= 0
      || !surface
      || !isGeneralGameWordDifficulty(difficulty)
      || !flags.has(generalGameWordPoolFlag)
      || !flags.has(generalGameWordDifficultyTags[difficulty])
    ) {
      continue;
    }

    const key = `${normalizedSurface}\u0000${reading}`;
    const previous = normalized.get(key);
    if (previous && previous.difficulty !== difficulty) {
      throw new Error("GENERAL_GAME_WORD_CLASSIFICATION_CONFLICT");
    }
    if (!previous || wordMasterId < previous.wordMasterId) {
      normalized.set(key, {
        wordMasterId,
        surface,
        normalizedSurface,
        reading,
        difficulty,
      });
    }
  }
  return [...normalized.values()].sort((left, right) => left.wordMasterId - right.wordMasterId);
}
