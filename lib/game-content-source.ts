import { createHash } from "node:crypto";
import {
  generalGameWordDifficultyWeights,
  normalizeGeneralGameWord,
  planGeneralGameWordBands,
  type GeneralGameWordDifficulty,
} from "./general-game-word-pool.ts";
import { loadGeneralGameWordRecords } from "./general-game-word-repository.ts";
import {
  loadReviewedWordPoolRecords,
  normalizeReviewedWordSurface,
  type ReviewedWordPool,
  type ReviewedWordRecord,
} from "./reviewed-word-pool.ts";

export type GameContentWord = ReviewedWordRecord & {
  /** Stable opaque identifier; callers must not treat it as a DB key. */
  opaqueId: string;
};

export type GameContentWordRequest = {
  pool: ReviewedWordPool;
  difficulty: GeneralGameWordDifficulty;
  count: number;
  excludeIds?: readonly string[];
  excludeSurfaces?: readonly string[];
  historyIds?: readonly string[];
};

function contentId(record: ReviewedWordRecord, suppliedSecret?: string) {
  const secret = suppliedSecret
    ?? process.env.PLAYER_SESSION_SECRET
    ?? process.env.LLM_SESSION_SECRET
    ?? (process.env.NODE_ENV === "test" ? "game-fields-content-test-secret" : "");
  if (secret.length < 16) throw new Error("GAME_CONTENT_ID_SECRET_UNAVAILABLE");
  return `gfp2.${createHash("sha256")
    .update("game-fields-reviewed-content:v2:")
    .update(secret)
    .update("\u0000")
    .update(record.pool)
    .update("\u0000")
    .update(record.id)
    .digest("base64url")}`;
}

function shuffle<T>(values: readonly T[], random = Math.random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.max(0, Math.min(0.999999999, random())) * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

function selectGeneralBands(
  records: readonly ReviewedWordRecord[],
  difficulty: GeneralGameWordDifficulty,
  count: number,
  random: () => number,
) {
  const queues = {
    easy: shuffle(records.filter((record) => record.difficulty === "easy"), random),
    normal: shuffle(records.filter((record) => record.difficulty === "normal"), random),
    hard: shuffle(records.filter((record) => record.difficulty === "hard"), random),
  };
  const selected: ReviewedWordRecord[] = [];
  for (const band of planGeneralGameWordBands(difficulty, count, random)) {
    const record = queues[band].pop();
    if (!record) throw new Error("GAME_CONTENT_UNAVAILABLE");
    selected.push(record);
  }
  return selected;
}

export async function drawGameContentWords(
  input: GameContentWordRequest,
  options: {
    random?: () => number;
    idSecret?: string;
    loadRecords?: () => Promise<readonly ReviewedWordRecord[]>;
  } = {},
): Promise<readonly GameContentWord[]> {
  const count = Math.max(1, Math.min(100, Math.floor(input.count)));
  const random = options.random ?? Math.random;
  const excludedIds = new Set([...(input.excludeIds ?? []), ...(input.historyIds ?? [])]);
  const excludedSurfaces = new Set([
    ...(input.excludeSurfaces ?? []),
  ].map(normalizeReviewedWordSurface).filter(Boolean));
  const records = options.loadRecords
    ? await options.loadRecords()
    : input.pool === "general"
      ? (await loadGeneralGameWordRecords(Math.max(50, count * 4))).map((record) => ({
        ...record,
        pool: "general" as const,
      }))
      : await loadReviewedWordPoolRecords({
          pool: input.pool,
          limitPerDifficulty: Math.max(50, count * 4),
        });
  const available = records.filter((record) => record.pool === input.pool).filter((record) => {
    const opaqueId = contentId(record, options.idSecret);
    return !excludedIds.has(record.id)
      && !excludedIds.has(opaqueId)
      && !excludedSurfaces.has(normalizeGeneralGameWord(record.surface));
  }).filter((record, index, values) => values.findIndex((candidate) => (
    normalizeReviewedWordSurface(candidate.surface) === normalizeReviewedWordSurface(record.surface)
  )) === index);
  const selected = input.pool === "general"
    ? selectGeneralBands(available, input.difficulty, count, random)
    : shuffle(available.filter((record) => record.difficulty === input.difficulty), random).slice(0, count);
  if (selected.length !== count) throw new Error("GAME_CONTENT_UNAVAILABLE");
  return selected.map((record) => ({ ...record, opaqueId: contentId(record, options.idSecret) }));
}

export function gameContentDifficultyWeights(difficulty: GeneralGameWordDifficulty) {
  return generalGameWordDifficultyWeights[difficulty];
}
