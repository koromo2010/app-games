import {
  getVocabularyPostgresClient,
  isVocabularyPostgresConfigured,
} from "./vocabulary-postgres-store.ts";

export const generalGameWordPoolSource = "word-master-active-zipf" as const;

export const generalGameWordZipfBands = {
  easy: { min: 5.5, max: 6.5 },
  normal: { min: 5, max: 5.5 },
  hard: { min: 4.5, max: 5 },
} as const;

export type GeneralGameWordDifficulty = keyof typeof generalGameWordZipfBands;

export type GeneralGameWordRecord = {
  id: string;
  surface: string;
  normalizedSurface: string;
  reading: string | null;
  difficulty: GeneralGameWordDifficulty;
};

type GeneralGameWordRow = {
  id: string;
  surface: string;
  normalized_surface: string;
  reading: string | null;
  difficulty: GeneralGameWordDifficulty;
};

export function generalGameWordDifficultyFromZipf(
  value: number,
): GeneralGameWordDifficulty | null {
  if (!Number.isFinite(value)) return null;
  if (
    value >= generalGameWordZipfBands.easy.min
    && value <= generalGameWordZipfBands.easy.max
  ) return "easy";
  if (
    value >= generalGameWordZipfBands.normal.min
    && value < generalGameWordZipfBands.normal.max
  ) return "normal";
  if (
    value >= generalGameWordZipfBands.hard.min
    && value < generalGameWordZipfBands.hard.max
  ) return "hard";
  return null;
}

export async function loadGeneralGameWordRecords(
  limitPerDifficulty = 500,
): Promise<GeneralGameWordRecord[]> {
  if (!isVocabularyPostgresConfigured()) {
    throw new Error("GENERAL_GAME_WORD_POOL_UNAVAILABLE");
  }
  const sql = getVocabularyPostgresClient();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limitPerDifficulty)));
  const rows = await sql`
    WITH classified AS (
      SELECT word.id, word.surface, word.normalized_surface, word.reading,
        CASE
          WHEN word.effective_zipf >= ${generalGameWordZipfBands.easy.min}
            AND word.effective_zipf <= ${generalGameWordZipfBands.easy.max}
            THEN 'easy'
          WHEN word.effective_zipf >= ${generalGameWordZipfBands.normal.min}
            AND word.effective_zipf < ${generalGameWordZipfBands.normal.max}
            THEN 'normal'
          WHEN word.effective_zipf >= ${generalGameWordZipfBands.hard.min}
            AND word.effective_zipf < ${generalGameWordZipfBands.hard.max}
            THEN 'hard'
        END AS difficulty
      FROM active_words word
      WHERE NOT word.proper_noun
        AND word.effective_zipf >= ${generalGameWordZipfBands.hard.min}
        AND word.effective_zipf <= ${generalGameWordZipfBands.easy.max}
    ), deduplicated AS (
      SELECT DISTINCT ON (normalized_surface)
        id, surface, normalized_surface, reading, difficulty
      FROM classified
      WHERE difficulty IS NOT NULL
      ORDER BY normalized_surface, id
    ), ranked AS (
      SELECT id, surface, normalized_surface, reading, difficulty,
        ROW_NUMBER() OVER (PARTITION BY difficulty ORDER BY id) AS pool_order
      FROM deduplicated
    )
    SELECT id, surface, normalized_surface, reading, difficulty
    FROM ranked
    WHERE pool_order <= ${safeLimit}
  ` as GeneralGameWordRow[];
  return rows.map((row) => ({
    id: row.id,
    surface: row.surface,
    normalizedSurface: row.normalized_surface,
    reading: row.reading,
    difficulty: row.difficulty,
  }));
}
