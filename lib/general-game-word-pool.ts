import { getVocabularyPostgresClient, isVocabularyPostgresConfigured } from "./vocabulary-postgres-store.ts";

export const generalGameWordPoolGameId = "general_word_pool" as const;
export const generalGameWordDifficulties = ["easy", "normal", "hard"] as const;

export type GeneralGameWordDifficulty = (typeof generalGameWordDifficulties)[number];
export type GeneralGameWordPools = Record<GeneralGameWordDifficulty, string[]>;

type GeneralGameWordRow = {
  surface: string;
  difficulty: GeneralGameWordDifficulty;
};

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

  const rows = await sql`
    WITH classified AS (
      SELECT word.surface, word.normalized_surface, word.updated_at,
        CASE
          WHEN LOWER(TRIM(eligibility.difficulty)) = 'easy' THEN 'easy'
          WHEN LOWER(TRIM(eligibility.difficulty)) IN ('normal', 'standard') THEN 'normal'
          WHEN LOWER(TRIM(eligibility.difficulty)) = 'hard' THEN 'hard'
          ELSE NULL
        END AS difficulty
      FROM active_words word
      JOIN active_word_game_eligibility eligibility
        ON eligibility.subject_type = 'word' AND eligibility.subject_id = word.id
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
