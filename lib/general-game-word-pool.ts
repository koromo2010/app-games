import {
  getVocabularyPostgresClient,
  isVocabularyPostgresConfigured,
  vocabularyDatabaseErrorCode,
} from "./vocabulary-postgres-store.ts";

export const generalGameWordPoolGameId = "general_word_pool" as const;
export const generalGameWordDifficulties = ["easy", "normal", "hard"] as const;
export const generalGameWordDifficultyTags = {
  easy: "difficulty_easy",
  normal: "difficulty_normal",
  hard: "difficulty_hard",
} as const;
export const generalGameWordDifficultyAliases = {
  easy: ["easy", generalGameWordDifficultyTags.easy],
  normal: ["normal", "standard", generalGameWordDifficultyTags.normal],
  hard: ["hard", generalGameWordDifficultyTags.hard],
} as const;

export type GeneralGameWordDifficulty = (typeof generalGameWordDifficulties)[number];
export type GeneralGameWordPools = Record<GeneralGameWordDifficulty, string[]>;

type GeneralGameWordRow = {
  surface: string;
  difficulty: GeneralGameWordDifficulty;
};

type GeneralGameWordPoolDiagnosticRow = {
  general_count: string | number;
  stored_difficulty_count: string | number;
  tagged_difficulty_count: string | number;
};

type GeneralGameWordPoolBaseDiagnosticRow = {
  general_count: string | number;
  enabled_count: string | number;
  active_word_count: string | number;
};

function databaseEndpointIdentity(value: string | undefined) {
  try {
    const url = new URL(value?.trim() ?? "");
    return `${url.hostname.toLowerCase()}${url.pathname}`;
  } catch {
    return "";
  }
}

function generalGameWordPoolErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNEXPECTED_ERROR";
  const candidate = error.message.split(":", 1)[0]?.trim() ?? "";
  if (/^[A-Z][A-Z0-9_]{2,79}$/.test(candidate)) return candidate;
  return error.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || "UNEXPECTED_ERROR";
}

function logGeneralGameWordPoolDiagnostic(
  level: "info" | "warn" | "error",
  operation: string,
  fields: { sourceCount?: number; errorCode?: string; databaseCode?: string; outcome: "success" | "failed" },
) {
  console[level](JSON.stringify({
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    level,
    event: "word.pool",
    service: "app-games-web",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    deployment: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),
    fields: { game: "general-word-pool", operation, ...fields },
  }));
}

const emptyPools = (): GeneralGameWordPools => ({ easy: [], normal: [], hard: [] });

export const generalGameWordDifficultyWeights: Record<
  GeneralGameWordDifficulty,
  Readonly<Record<GeneralGameWordDifficulty, number>>
> = {
  easy: { easy: 1, normal: 0, hard: 0 },
  normal: { easy: 0.2, normal: 0.8, hard: 0 },
  hard: { easy: 0.1, normal: 0.4, hard: 0.5 },
};

export function normalizeGeneralGameWord(word: string) {
  return word.normalize("NFKC").trim().toLocaleLowerCase("ja-JP");
}

export function normalizeGeneralGameWordDifficulty(value: unknown): GeneralGameWordDifficulty {
  return value === "easy" || value === "hard" ? value : "normal";
}

export function pickGeneralGameWordBand(
  difficulty: GeneralGameWordDifficulty,
  random = Math.random,
): GeneralGameWordDifficulty {
  const roll = Math.max(0, Math.min(0.999999999999, random()));
  const weights = generalGameWordDifficultyWeights[difficulty];
  if (roll < weights.easy) return "easy";
  if (roll < weights.easy + weights.normal) return "normal";
  return "hard";
}

export function planGeneralGameWordBands(
  difficulty: GeneralGameWordDifficulty,
  count: number,
  random = Math.random,
) {
  const safeCount = Math.max(0, Math.min(100, Math.floor(count)));
  return Array.from({ length: safeCount }, () => pickGeneralGameWordBand(difficulty, random));
}

function shuffle<T>(values: readonly T[], random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const roll = Math.max(0, Math.min(0.999999999999, random()));
    const target = Math.floor(roll * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function selectGeneralGameWordsForBands(
  pools: GeneralGameWordPools,
  plannedBands: readonly GeneralGameWordDifficulty[],
  random = Math.random,
) {
  const queues = {
    easy: shuffle(pools.easy, random),
    normal: shuffle(pools.normal, random),
    hard: shuffle(pools.hard, random),
  };
  const used = new Set<string>();
  const selected: string[] = [];
  for (const plannedBand of plannedBands) {
    let picked = "";
    while (queues[plannedBand].length > 0) {
      const candidate = queues[plannedBand].pop()?.trim() ?? "";
      const key = normalizeGeneralGameWord(candidate);
      if (!candidate || used.has(key)) continue;
      used.add(key);
      picked = candidate;
      break;
    }
    if (!picked) throw new Error("GENERAL_GAME_WORD_POOL_UNAVAILABLE");
    selected.push(picked);
  }
  return selected;
}

export async function loadGeneralGameWordPools(
  limitPerDifficulty = 100,
  excludeWords: readonly string[] = [],
): Promise<GeneralGameWordPools> {
  if (!isVocabularyPostgresConfigured()) throw new Error("GENERAL_GAME_WORD_POOL_UNAVAILABLE");
  const sql = getVocabularyPostgresClient();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limitPerDifficulty)));
  const excluded = [...new Set(excludeWords.map(normalizeGeneralGameWord).filter(Boolean))].slice(0, 20_000);

  let rows: GeneralGameWordRow[];
  try {
    rows = await sql`
      WITH classified AS (
      SELECT word.surface, word.normalized_surface, word.updated_at,
        CASE
          WHEN difficulty_eligibility.game_id = ${generalGameWordDifficultyTags.easy}
            OR LOWER(TRIM(COALESCE(eligibility.difficulty, ''))) IN (
              ${generalGameWordDifficultyAliases.easy[0]},
              ${generalGameWordDifficultyAliases.easy[1]}
            ) THEN 'easy'
          WHEN difficulty_eligibility.game_id = ${generalGameWordDifficultyTags.normal}
            OR LOWER(TRIM(COALESCE(eligibility.difficulty, ''))) IN (
              ${generalGameWordDifficultyAliases.normal[0]},
              ${generalGameWordDifficultyAliases.normal[1]},
              ${generalGameWordDifficultyAliases.normal[2]}
            ) THEN 'normal'
          WHEN difficulty_eligibility.game_id = ${generalGameWordDifficultyTags.hard}
            OR LOWER(TRIM(COALESCE(eligibility.difficulty, ''))) IN (
              ${generalGameWordDifficultyAliases.hard[0]},
              ${generalGameWordDifficultyAliases.hard[1]}
            ) THEN 'hard'
        END AS difficulty
      FROM active_words word
      JOIN active_word_game_eligibility eligibility
        ON eligibility.subject_type = 'word' AND eligibility.subject_id = word.id
      LEFT JOIN active_word_game_eligibility difficulty_eligibility
        ON difficulty_eligibility.subject_type = 'word'
        AND difficulty_eligibility.subject_id = word.id
        AND difficulty_eligibility.game_id IN (
          ${generalGameWordDifficultyTags.easy},
          ${generalGameWordDifficultyTags.normal},
          ${generalGameWordDifficultyTags.hard}
        )
        AND (difficulty_eligibility.valid_from IS NULL OR difficulty_eligibility.valid_from <= NOW())
        AND (difficulty_eligibility.valid_until IS NULL OR difficulty_eligibility.valid_until > NOW())
      WHERE eligibility.game_id = ${generalGameWordPoolGameId}
        AND NOT (word.normalized_surface = ANY(${excluded}::text[]))
        AND (eligibility.valid_from IS NULL OR eligibility.valid_from <= NOW())
        AND (eligibility.valid_until IS NULL OR eligibility.valid_until > NOW())
    ), deduplicated AS (
      SELECT DISTINCT ON (normalized_surface) surface, difficulty, updated_at
      FROM classified
      WHERE difficulty IS NOT NULL
      ORDER BY normalized_surface, updated_at DESC
    ), eligible AS (
      SELECT surface, difficulty,
        ROW_NUMBER() OVER (PARTITION BY difficulty ORDER BY RANDOM()) AS random_order
      FROM deduplicated
    )
    SELECT surface, difficulty
    FROM eligible
    WHERE random_order <= ${safeLimit}
    ` as GeneralGameWordRow[];
  } catch (error) {
    logGeneralGameWordPoolDiagnostic("error", "load-query", {
      errorCode: generalGameWordPoolErrorCode(error),
      databaseCode: vocabularyDatabaseErrorCode(error),
      outcome: "failed",
    });
    throw error;
  }

  const pools = emptyPools();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.difficulty !== "easy" && row.difficulty !== "normal" && row.difficulty !== "hard") continue;
    const surface = row.surface.trim();
    const key = normalizeGeneralGameWord(surface);
    if (!surface || seen.has(key)) continue;
    seen.add(key);
    pools[row.difficulty].push(surface);
  }
  for (const difficulty of generalGameWordDifficulties) {
    logGeneralGameWordPoolDiagnostic("info", `loaded-${difficulty}`, {
      sourceCount: pools[difficulty].length,
      outcome: pools[difficulty].length > 0 ? "success" : "failed",
    });
  }
  if (rows.length === 0) {
    const readerIdentity = databaseEndpointIdentity(process.env.VOCABULARY_DATABASE_URL);
    const adminIdentity = databaseEndpointIdentity(process.env.VOCABULARY_ADMIN_DATABASE_URL);
    logGeneralGameWordPoolDiagnostic("warn", "admin-target-configured", {
      sourceCount: adminIdentity ? 1 : 0,
      outcome: "failed",
    });
    logGeneralGameWordPoolDiagnostic("warn", "reader-admin-same-target", {
      sourceCount: readerIdentity && readerIdentity === adminIdentity ? 1 : 0,
      outcome: "failed",
    });
    try {
      const diagnosticRows = await sql`
        WITH active_eligibility AS (
          SELECT eligibility.subject_id, eligibility.game_id, eligibility.difficulty
          FROM active_word_game_eligibility eligibility
          JOIN active_words word
            ON eligibility.subject_type = 'word' AND eligibility.subject_id = word.id
        ), general_pool AS (
          SELECT * FROM active_eligibility WHERE game_id = ${generalGameWordPoolGameId}
        )
        SELECT
          (SELECT COUNT(*) FROM general_pool) AS general_count,
          (SELECT COUNT(*) FROM general_pool
            WHERE LOWER(TRIM(COALESCE(difficulty, ''))) IN (
              ${generalGameWordDifficultyAliases.easy[0]},
              ${generalGameWordDifficultyAliases.easy[1]},
              ${generalGameWordDifficultyAliases.normal[0]},
              ${generalGameWordDifficultyAliases.normal[1]},
              ${generalGameWordDifficultyAliases.normal[2]},
              ${generalGameWordDifficultyAliases.hard[0]},
              ${generalGameWordDifficultyAliases.hard[1]}
            )) AS stored_difficulty_count,
          (SELECT COUNT(*) FROM general_pool general
            WHERE EXISTS (
              SELECT 1 FROM active_eligibility difficulty
              WHERE difficulty.subject_id = general.subject_id
                AND difficulty.game_id IN (
                  ${generalGameWordDifficultyTags.easy},
                  ${generalGameWordDifficultyTags.normal},
                  ${generalGameWordDifficultyTags.hard}
                )
            )) AS tagged_difficulty_count
      ` as GeneralGameWordPoolDiagnosticRow[];
      const diagnostic = diagnosticRows[0];
      for (const [operation, value] of [
        ["active-general", diagnostic?.general_count],
        ["stored-difficulty", diagnostic?.stored_difficulty_count],
        ["tagged-difficulty", diagnostic?.tagged_difficulty_count],
      ] as const) {
        logGeneralGameWordPoolDiagnostic("warn", operation, {
          sourceCount: Number(value ?? 0),
          outcome: "failed",
        });
      }
    } catch (error) {
      logGeneralGameWordPoolDiagnostic("error", "diagnostic-query", {
        errorCode: generalGameWordPoolErrorCode(error),
        databaseCode: vocabularyDatabaseErrorCode(error),
        outcome: "failed",
      });
    }
    try {
      const baseRows = await sql`
        SELECT
          COUNT(*) FILTER (WHERE eligibility.game_id = ${generalGameWordPoolGameId}) AS general_count,
          COUNT(*) FILTER (WHERE eligibility.game_id = ${generalGameWordPoolGameId}
            AND eligibility.enabled AND NOT eligibility.manually_suspended) AS enabled_count,
          COUNT(*) FILTER (WHERE eligibility.game_id = ${generalGameWordPoolGameId}
            AND eligibility.enabled AND NOT eligibility.manually_suspended
            AND word.status = 'active') AS active_word_count
        FROM word_game_eligibility eligibility
        JOIN words word ON eligibility.subject_type = 'word' AND eligibility.subject_id = word.id
      ` as GeneralGameWordPoolBaseDiagnosticRow[];
      const base = baseRows[0];
      for (const [operation, value] of [
        ["base-general", base?.general_count],
        ["base-enabled", base?.enabled_count],
        ["base-active-word", base?.active_word_count],
      ] as const) {
        logGeneralGameWordPoolDiagnostic("warn", operation, {
          sourceCount: Number(value ?? 0),
          outcome: "failed",
        });
      }
    } catch (error) {
      logGeneralGameWordPoolDiagnostic("error", "base-diagnostic-query", {
        errorCode: generalGameWordPoolErrorCode(error),
        databaseCode: vocabularyDatabaseErrorCode(error),
        outcome: "failed",
      });
    }
  }
  return pools;
}

export async function loadGeneralGameWords(input: {
  difficulty: GeneralGameWordDifficulty;
  count: number;
  excludeWords?: readonly string[];
  random?: () => number;
}) {
  const count = Math.max(1, Math.min(100, Math.floor(input.count)));
  const random = input.random ?? Math.random;
  const plannedBands = planGeneralGameWordBands(input.difficulty, count, random);
  const pools = await loadGeneralGameWordPools(Math.max(50, count * 4), input.excludeWords ?? []);
  return selectGeneralGameWordsForBands(pools, plannedBands, random);
}
