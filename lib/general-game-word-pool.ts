import {
  getPostgresClient,
  isPostgresConfigured,
} from "./postgres-store.ts";
import { expectedAppEnvironment } from "./storage-environment-guard.ts";

export const generalGameWordPoolKey = "standard-game" as const;
export const generalGameWordPoolFlag = "general_game_pool" as const;
export const generalGameWordDifficulties = ["easy", "normal", "hard"] as const;
export const generalGameWordDifficultyTags = {
  easy: "difficulty_easy",
  normal: "difficulty_normal",
  hard: "difficulty_hard",
} as const;
export type GeneralGameWordDifficulty = (typeof generalGameWordDifficulties)[number];
export type GeneralGameWordPools = Record<GeneralGameWordDifficulty, string[]>;

type GeneralGameWordRow = {
  surface: string;
  difficulty: GeneralGameWordDifficulty;
};

type GeneralGameWordPoolDiagnosticRow = {
  active_catalog_count: string | number;
  standard_pool_count: string | number;
  general_flag_count: string | number;
  classified_count: string | number;
};

function generalGameWordPoolErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNEXPECTED_ERROR";
  const candidate = error.message.split(":", 1)[0]?.trim() ?? "";
  if (/^[A-Z][A-Z0-9_]{2,79}$/.test(candidate)) return candidate;
  return error.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 80) || "UNEXPECTED_ERROR";
}

function postgresDatabaseErrorCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
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
    environment: expectedAppEnvironment(),
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
  if (!isPostgresConfigured()) throw new Error("GENERAL_GAME_WORD_POOL_UNAVAILABLE");
  const sql = getPostgresClient();
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limitPerDifficulty)));
  const excluded = new Set(excludeWords.map(normalizeGeneralGameWord).filter(Boolean));

  let rows: GeneralGameWordRow[];
  try {
    rows = await sql`
      SELECT catalog.surface, evaluation.difficulty_tier AS difficulty
      FROM shared_word_catalog catalog
      JOIN shared_word_pool_evaluations evaluation
        ON evaluation.word_master_id = catalog.word_master_id
      WHERE catalog.active
        AND evaluation.pool_key = ${generalGameWordPoolKey}
        AND evaluation.active
        AND evaluation.eligibility_status = 'eligible'
        AND evaluation.difficulty_tier IN ('easy', 'normal', 'hard')
        AND ${generalGameWordPoolFlag} = ANY(evaluation.evaluation_flags)
        AND ('difficulty_' || evaluation.difficulty_tier) = ANY(evaluation.evaluation_flags)
      ORDER BY catalog.word_master_id
    ` as GeneralGameWordRow[];
  } catch (error) {
    logGeneralGameWordPoolDiagnostic("error", "load-query", {
      errorCode: generalGameWordPoolErrorCode(error),
      databaseCode: postgresDatabaseErrorCode(error),
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
    if (!surface || excluded.has(key) || seen.has(key)) continue;
    seen.add(key);
    pools[row.difficulty].push(surface);
  }
  for (const difficulty of generalGameWordDifficulties) {
    pools[difficulty] = shuffle(pools[difficulty]).slice(0, safeLimit);
    logGeneralGameWordPoolDiagnostic("info", `loaded-${difficulty}`, {
      sourceCount: pools[difficulty].length,
      outcome: pools[difficulty].length > 0 ? "success" : "failed",
    });
  }
  if (rows.length === 0) {
    try {
      const diagnosticRows = await sql`
        SELECT
          COUNT(*) FILTER (WHERE catalog.active) AS active_catalog_count,
          COUNT(*) FILTER (WHERE evaluation.pool_key = ${generalGameWordPoolKey}
            AND evaluation.active AND evaluation.eligibility_status = 'eligible') AS standard_pool_count,
          COUNT(*) FILTER (WHERE evaluation.pool_key = ${generalGameWordPoolKey}
            AND evaluation.active AND evaluation.eligibility_status = 'eligible'
            AND ${generalGameWordPoolFlag} = ANY(evaluation.evaluation_flags)) AS general_flag_count,
          COUNT(*) FILTER (WHERE evaluation.pool_key = ${generalGameWordPoolKey}
            AND evaluation.active AND evaluation.eligibility_status = 'eligible'
            AND ${generalGameWordPoolFlag} = ANY(evaluation.evaluation_flags)
            AND evaluation.difficulty_tier IN ('easy', 'normal', 'hard')) AS classified_count
        FROM shared_word_catalog catalog
        LEFT JOIN shared_word_pool_evaluations evaluation
          ON evaluation.word_master_id = catalog.word_master_id
      ` as GeneralGameWordPoolDiagnosticRow[];
      const diagnostic = diagnosticRows[0];
      for (const [operation, value] of [
        ["active-catalog", diagnostic?.active_catalog_count],
        ["standard-pool", diagnostic?.standard_pool_count],
        ["general-flag", diagnostic?.general_flag_count],
        ["classified", diagnostic?.classified_count],
      ] as const) {
        logGeneralGameWordPoolDiagnostic("warn", operation, {
          sourceCount: Number(value ?? 0),
          outcome: "failed",
        });
      }
    } catch (error) {
      logGeneralGameWordPoolDiagnostic("error", "diagnostic-query", {
        errorCode: generalGameWordPoolErrorCode(error),
        databaseCode: postgresDatabaseErrorCode(error),
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
