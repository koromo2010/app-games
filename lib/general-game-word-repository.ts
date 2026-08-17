import {
  getVocabularyPostgresClient,
  isVocabularyPostgresConfigured,
} from "./vocabulary-postgres-store.ts";
import { loadReviewedWordPoolRecords } from "./reviewed-word-pool.ts";
import {
  generalGameWordDifficulties,
  generalGameWordDifficultyTags,
  generalGameWordPoolFlag,
  generalGameWordPoolKey,
  generalGameWordPoolSource,
  isGeneralGameWordDifficulty,
  type GeneralGameWordDifficulty,
} from "./general-game-word-classification.ts";

export {
  generalGameWordDifficulties,
  generalGameWordDifficultyTags,
  generalGameWordPoolFlag,
  generalGameWordPoolKey,
  generalGameWordPoolSource,
};
export type { GeneralGameWordDifficulty };

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
  difficulty: string;
};

export async function loadGeneralGameWordRecords(
  limitPerDifficulty = 500,
): Promise<GeneralGameWordRecord[]> {
  if (!isVocabularyPostgresConfigured()) {
    throw new Error("GENERAL_GAME_WORD_POOL_UNAVAILABLE");
  }
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limitPerDifficulty)));
  try {
    const reviewedRows = await loadReviewedWordPoolRecords({
      pool: "general",
      limitPerDifficulty: safeLimit,
    });
    return reviewedRows.map((row) => ({
      id: row.id,
      surface: row.surface,
      normalizedSurface: row.normalizedSurface,
      reading: row.reading,
      difficulty: row.difficulty,
    }));
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "REVIEWED_WORD_POOL_SCHEMA_UNAVAILABLE") {
      throw error;
    }
  }

  // Compatibility for a local database that has the pre-membership schema.
  // This remains the same reviewed standard-game eligibility boundary; it is
  // not a fixed vocabulary fallback.
  const sql = getVocabularyPostgresClient();
  const rows = await sql`
    WITH classified AS (
      SELECT word.id, word.surface, word.normalized_surface, word.reading,
        pool.difficulty
      FROM active_words word
      JOIN active_word_game_eligibility pool
        ON pool.subject_type = 'word'
        AND pool.subject_id = word.id
        AND pool.game_id = ${generalGameWordPoolKey}
      JOIN active_word_game_eligibility general_flag
        ON general_flag.subject_type = 'word'
        AND general_flag.subject_id = word.id
        AND general_flag.game_id = ${generalGameWordPoolFlag}
      JOIN active_word_game_eligibility difficulty_flag
        ON difficulty_flag.subject_type = 'word'
        AND difficulty_flag.subject_id = word.id
        AND difficulty_flag.game_id = ('difficulty_' || pool.difficulty)
      WHERE pool.difficulty IN (
        ${generalGameWordDifficulties[0]},
        ${generalGameWordDifficulties[1]},
        ${generalGameWordDifficulties[2]}
      )
        AND (pool.valid_from IS NULL OR pool.valid_from <= NOW())
        AND (pool.valid_until IS NULL OR pool.valid_until > NOW())
        AND (general_flag.valid_from IS NULL OR general_flag.valid_from <= NOW())
        AND (general_flag.valid_until IS NULL OR general_flag.valid_until > NOW())
        AND (difficulty_flag.valid_from IS NULL OR difficulty_flag.valid_from <= NOW())
        AND (difficulty_flag.valid_until IS NULL OR difficulty_flag.valid_until > NOW())
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
  return rows.flatMap((row) => isGeneralGameWordDifficulty(row.difficulty) ? [{
    id: row.id,
    surface: row.surface,
    normalizedSurface: row.normalized_surface,
    reading: row.reading,
    difficulty: row.difficulty,
  }] : []);
}
