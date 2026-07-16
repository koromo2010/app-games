import { redisCommand, redisPipeline } from "@/lib/redis-store";
import { getTopicKey, getTopicWords, type WordWolfTopic } from "@/lib/wordwolf";
import { runtimeHyperparameterNumber } from "@/lib/runtime-hyperparameters-core";

const keyPrefix = "game-history:v3:wordwolf";
const dayKeyTtlSeconds = 3 * 24 * 60 * 60;
const defaultPairCooldownDays = 30;

function uniquePlayerIds(playerIds: string[]) {
  return [...new Set(playerIds.filter(Boolean))];
}

function tokyoDay(now: number) {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replaceAll("-", "");
}

function dailyKey(playerId: string, now: number) {
  return `${keyPrefix}:daily:${tokyoDay(now)}:${playerId}`;
}

function pairKey(playerId: string) {
  return `${keyPrefix}:pair:${playerId}`;
}

export function getWordWolfPairCooldownDays() {
  const configured = Number(process.env.WORDWOLF_PAIR_COOLDOWN_DAYS);
  const fallback = Number.isFinite(configured) && configured >= 1 && configured <= 3650
    ? Math.floor(configured)
    : defaultPairCooldownDays;
  return runtimeHyperparameterNumber("wordwolf-pair-cooldown", fallback);
}

export async function loadTodaysExperiencedWords(playerIds: string[], now = Date.now()) {
  const ids = uniquePlayerIds(playerIds);
  const results = await redisPipeline<string[][]>(ids.map((id) => ["SMEMBERS", dailyKey(id, now)]));
  return [...new Set(results.flat().filter((word): word is string => typeof word === "string"))];
}

export async function filterEligibleWordWolfTopics(
  topics: WordWolfTopic[],
  playerIds: string[],
  now = Date.now(),
) {
  const ids = uniquePlayerIds(playerIds);
  if (ids.length === 0 || topics.length === 0) return [];
  const pairIds = topics.map(getTopicKey);
  const cutoff = now - getWordWolfPairCooldownDays() * 24 * 60 * 60 * 1000;
  const scores = await redisPipeline<Array<Array<string | null>>>(
    ids.map((id) => ["ZMSCORE", pairKey(id), ...pairIds]),
  );
  return topics.filter((_, topicIndex) => scores.every((playerScores) => {
    const score = Number(playerScores[topicIndex]);
    return !Number.isFinite(score) || score < cutoff;
  }));
}

export async function rememberWordWolfTopicHistory(
  topic: WordWolfTopic,
  playerIds: string[],
  now = Date.now(),
) {
  const ids = uniquePlayerIds(playerIds);
  const words = getTopicWords(topic);
  if (ids.length === 0 || words.length !== 2) return;
  const pairId = getTopicKey(topic);
  const commands = ids.flatMap((id) => [
    ["SADD", dailyKey(id, now), words[0], words[1]],
    ["EXPIRE", dailyKey(id, now), dayKeyTtlSeconds],
    ["ZADD", pairKey(id), now, pairId],
    // 期限切れペアは物理削除し、DBを際限なく増やさない。
    ["ZREMRANGEBYSCORE", pairKey(id), "-inf", now - getWordWolfPairCooldownDays() * 86400000],
  ]);
  await redisPipeline<unknown[]>(commands);
}

/** 運営・移行ツールから、指定ペアの禁則を即時解除するための入口。 */
export async function releaseWordWolfPairCooldown(playerIds: string[], topic: WordWolfTopic) {
  const ids = uniquePlayerIds(playerIds);
  if (ids.length === 0) return;
  await redisCommand<number>(["EVAL", "for i=1,#KEYS do redis.call('ZREM',KEYS[i],ARGV[1]) end return #KEYS", String(ids.length), ...ids.map(pairKey), getTopicKey(topic)]);
}
