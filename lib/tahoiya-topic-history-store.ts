import { createHash } from "node:crypto";
import { redisPipeline } from "./redis-store.ts";

const keyPrefix = "game-history:v2:tahoiya";

function uniquePlayerIds(playerIds: string[]) {
  return [...new Set(playerIds.map((id) => id.trim()).filter(Boolean))];
}

export function normalizeTahoiyaHistoryWord(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

export function getTahoiyaHistoryTopicId(word: string) {
  const normalized = normalizeTahoiyaHistoryWord(word);
  return normalized
    ? `word-v1:${createHash("sha256").update(normalized).digest("base64url")}`
    : "";
}

function historyKey(playerId: string) {
  return `${keyPrefix}:${playerId}`;
}

export async function filterUnexperiencedTahoiyaWords<T extends { word: string }>(
  candidates: T[],
  playerIds: string[],
) {
  const ids = uniquePlayerIds(playerIds);
  if (ids.length === 0 || candidates.length === 0) return [];
  const topicIds = candidates.map((candidate) => getTahoiyaHistoryTopicId(candidate.word));
  const membership = await redisPipeline<Array<Array<number | string>>>(
    ids.map((playerId) => ["SMISMEMBER", historyKey(playerId), ...topicIds]),
  );
  return candidates.filter((_, candidateIndex) => membership.every((playerMembership) =>
    Number(playerMembership[candidateIndex]) !== 1
  ));
}

export async function rememberTahoiyaTopicHistory(word: string, playerIds: string[]) {
  const ids = uniquePlayerIds(playerIds);
  const topicId = getTahoiyaHistoryTopicId(word);
  if (!topicId || ids.length === 0) return;
  await redisPipeline<unknown[]>(ids.map((playerId) => ["SADD", historyKey(playerId), topicId]));
}

export async function migrateLegacyTahoiyaTopicHistory(
  records: Array<{ word: string; experiencedPlayerIds: string[] }>,
) {
  const commands = records.flatMap((record) => {
    const topicId = getTahoiyaHistoryTopicId(record.word);
    if (!topicId) return [];
    return uniquePlayerIds(record.experiencedPlayerIds)
      .map((playerId) => ["SADD", historyKey(playerId), topicId]);
  });
  if (commands.length === 0) return 0;
  await redisPipeline<unknown[]>(commands);
  return commands.length;
}
