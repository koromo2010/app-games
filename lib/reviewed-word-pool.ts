import {
  getVocabularyPostgresClient,
  isVocabularyPostgresConfigured,
} from "./vocabulary-postgres-store.ts";
import {
  generalGameWordDifficulties,
  type GeneralGameWordDifficulty,
} from "./general-game-word-classification.ts";

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
    throw new Error("REVIEWED_WORD_POOL_UNAVAILABLE");
  }
  const sql = getVocabularyPostgresClient();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(input.limitPerDifficulty ?? 500)));
  const difficulties = input.difficulty
    ? [input.difficulty]
    : [...generalGameWordDifficulties];
  try {
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
      )
      SELECT id, surface, normalized_surface, reading, difficulty
      FROM ranked
      WHERE surface_order = 1
      ORDER BY difficulty, id
      LIMIT ${safeLimit * difficulties.length}
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
