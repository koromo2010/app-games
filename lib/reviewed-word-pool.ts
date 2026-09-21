import {
  getVocabularyPostgresClient,
  isVocabularyPostgresConfigured,
} from "./vocabulary-postgres-store.ts";
import {
  generalGameWordDifficulties,
  type GeneralGameWordDifficulty,
} from "./general-game-word-classification.ts";
import { reportWordPoolFailure } from "./word-pool-diagnostics.ts";

export const reviewedWordPools = [
  "general",
  "proper-noun",
  "four-character-idiom",
] as const;

export type ReviewedWordPool = (typeof reviewedWordPools)[number];
export type ReviewedWordDifficulty = GeneralGameWordDifficulty;

export type ReviewedWordRecord = {
  id: string;
  surface: string;
  normalizedSurface: string;
  reading: string | null;
  difficulty: ReviewedWordDifficulty;
  pool: ReviewedWordPool;
};

type ReviewedWordRow = {
  id: string;
  surface: string;
  normalized_surface: string;
  reading: string | null;
  difficulty: string;
};

function isReviewedWordDifficulty(value: string): value is ReviewedWordDifficulty {
  return (generalGameWordDifficulties as readonly string[]).includes(value);
}

function isMissingMembershipTable(error: unknown) {
  return Boolean(
    error && typeof error === "object" && "code" in error
      && (error as { code?: unknown }).code === "42P01",
  );
}

/**
 * Reads the reviewed pool membership boundary. The membership table is a
 * read-only synchronization target; it is intentionally not represented in
 * the client SDK or in game packages.
 */
export async function loadReviewedWordPoolRecords(input: {
  pool: ReviewedWordPool;
  difficulty?: ReviewedWordDifficulty;
  limitPerDifficulty?: number;
}) {
  if (!isVocabularyPostgresConfigured()) {
    reportWordPoolFailure("reviewed-query", "configuration");
    throw new Error("REVIEWED_WORD_POOL_UNAVAILABLE");
  }
  const safeLimit = Math.max(1, Math.min(500, Math.floor(input.limitPerDifficulty ?? 500)));
  const difficulties = input.difficulty
    ? [input.difficulty]
    : [...generalGameWordDifficulties];
  try {
    const sql = getVocabularyPostgresClient();
    const rows = await sql`
      WITH ranked AS (
        SELECT word.id, word.surface, word.normalized_surface, word.reading,
               membership.difficulty,
               ROW_NUMBER() OVER (
                 PARTITION BY membership.difficulty, word.normalized_surface
                 ORDER BY word.id
               ) AS surface_order
        FROM active_words word
        JOIN word_pool_memberships membership
          ON membership.word_id = word.id
        WHERE membership.pool = ${input.pool}
          AND membership.difficulty = ANY(${difficulties}::text[])
      ), limited AS (
        SELECT id, surface, normalized_surface, reading, difficulty,
               ROW_NUMBER() OVER (
                 PARTITION BY difficulty ORDER BY id
               ) AS difficulty_order
        FROM ranked
        WHERE surface_order = 1
      )
      SELECT id, surface, normalized_surface, reading, difficulty
      FROM limited
      WHERE difficulty_order <= ${safeLimit}
      ORDER BY difficulty, id
    ` as ReviewedWordRow[];
    return rows.flatMap((row) => isReviewedWordDifficulty(row.difficulty) ? [{
      id: row.id,
      surface: row.surface,
      normalizedSurface: row.normalized_surface,
      reading: row.reading,
      difficulty: row.difficulty,
      pool: input.pool,
    }] : []);
  } catch (error) {
    reportWordPoolFailure("reviewed-query", "database", error);
    // Older local databases predate the synchronized membership table. Do not
    // silently substitute another pool: callers must see unavailable content.
    if (isMissingMembershipTable(error)) {
      throw new Error("REVIEWED_WORD_POOL_SCHEMA_UNAVAILABLE");
    }
    throw error;
  }
}

export function normalizeReviewedWordSurface(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}
