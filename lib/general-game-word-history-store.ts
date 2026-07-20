import {
  loadGeneralGameWordPools,
  normalizeGeneralGameWord,
  planGeneralGameWordBands,
  selectGeneralGameWordsForBands,
  type GeneralGameWordDifficulty,
} from "./general-game-word-pool.ts";
import { redisCommand, redisPipeline } from "./redis-store.ts";

export type GeneralGameWordHistoryGame = "nigoichi" | "code-intercept";

const keyPrefix = "game-history:v1:general-game-word";
const dayKeyTtlSeconds = 3 * 24 * 60 * 60;

function uniquePlayerIds(playerIds: readonly string[]) {
  return [...new Set(playerIds.map((id) => id.trim()).filter(Boolean))];
}

export function generalGameWordHistoryTokyoDay(now: number) {
  return new Date(now + 9 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

export function generalGameWordDailyHistoryKey(
  game: GeneralGameWordHistoryGame,
  playerId: string,
  now: number,
) {
  return `${keyPrefix}:${game}:daily:${generalGameWordHistoryTokyoDay(now)}:${playerId}`;
}

export async function loadTodaysGeneralGameWordHistory(
  game: GeneralGameWordHistoryGame,
  playerIds: readonly string[],
  now = Date.now(),
) {
  const ids = uniquePlayerIds(playerIds);
  const results = await redisPipeline<string[][]>(ids.map((id) => ["SMEMBERS", generalGameWordDailyHistoryKey(game, id, now)]));
  return [...new Set(results.flat().map(normalizeGeneralGameWord).filter(Boolean))];
}

export async function prepareGeneralGameWordDraw(input: {
  game: GeneralGameWordHistoryGame;
  playerIds: readonly string[];
  difficulty: GeneralGameWordDifficulty;
  count: number;
  now?: number;
  random?: () => number;
}) {
  const now = input.now ?? Date.now();
  const random = input.random ?? Math.random;
  const count = Math.max(1, Math.min(100, Math.floor(input.count)));
  const plannedBands = planGeneralGameWordBands(input.difficulty, count, random);
  const experiencedWords = await loadTodaysGeneralGameWordHistory(input.game, input.playerIds, now);
  const limitPerDifficulty = Math.max(50, count * 4);
  const unseenPools = await loadGeneralGameWordPools(limitPerDifficulty, experiencedWords);
  try {
    return {
      words: selectGeneralGameWordsForBands(unseenPools, plannedBands, random),
      resetHistory: false,
      now,
    };
  } catch (error) {
    if (!(error instanceof Error)
      || error.message !== "GENERAL_GAME_WORD_POOL_UNAVAILABLE"
      || experiencedWords.length === 0) throw error;
  }

  const resetPools = await loadGeneralGameWordPools(limitPerDifficulty);
  return {
    words: selectGeneralGameWordsForBands(resetPools, plannedBands, random),
    resetHistory: true,
    now,
  };
}

export async function rememberGeneralGameWordHistory(input: {
  game: GeneralGameWordHistoryGame;
  playerIds: readonly string[];
  words: readonly string[];
  resetHistory?: boolean;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const keys = uniquePlayerIds(input.playerIds).map((id) => generalGameWordDailyHistoryKey(input.game, id, now));
  const words = [...new Set(input.words.map(normalizeGeneralGameWord).filter(Boolean))];
  if (keys.length === 0 || words.length === 0) return;
  await redisCommand<number>([
    "EVAL",
    "if ARGV[1]=='1' then for i=1,#KEYS do redis.call('DEL',KEYS[i]) end end; for i=1,#KEYS do for j=3,#ARGV do redis.call('SADD',KEYS[i],ARGV[j]) end; redis.call('EXPIRE',KEYS[i],ARGV[2]) end; return #KEYS",
    String(keys.length),
    ...keys,
    input.resetHistory ? "1" : "0",
    String(dayKeyTtlSeconds),
    ...words,
  ]);
}
