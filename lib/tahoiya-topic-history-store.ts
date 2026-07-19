import { createHash } from "node:crypto";
import { redisPipeline } from "./redis-store.ts";
import {
  isTahoiyaHistoryTopicId,
  normalizeTahoiyaHistoryTopicIds,
  normalizeTahoiyaHistoryWord,
} from "./tahoiya-topic-history-id.ts";

const keyPrefix = "game-history:v2:tahoiya";
const deviceBridgeKeyPrefix = "game-history:device-bridge:v1:tahoiya";
const deviceBridgeTtlSeconds = 90 * 24 * 60 * 60;

export { normalizeTahoiyaHistoryTopicIds, normalizeTahoiyaHistoryWord } from "./tahoiya-topic-history-id.ts";

function uniquePlayerIds(playerIds: string[]) {
  return [...new Set(playerIds.map((id) => id.trim()).filter(Boolean))];
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

function deviceBridgeHistoryKey(playerId: string) {
  return `${deviceBridgeKeyPrefix}:${playerId}`;
}

export function tahoiyaHistoryKeysForPlayer(playerId: string) {
  const normalizedPlayerId = playerId.trim();
  return normalizedPlayerId
    ? [historyKey(normalizedPlayerId), deviceBridgeHistoryKey(normalizedPlayerId)]
    : [];
}

export async function filterUnexperiencedTahoiyaWords<T extends { word: string }>(
  candidates: T[],
  playerIds: string[],
  includeDeviceBridge = false,
) {
  const ids = uniquePlayerIds(playerIds);
  if (ids.length === 0 || candidates.length === 0) return [];
  const topicIds = candidates.map((candidate) => getTahoiyaHistoryTopicId(candidate.word));
  const [membership, deviceMembership] = await Promise.all([
    redisPipeline<Array<Array<number | string>>>(
      ids.map((playerId) => ["SMISMEMBER", historyKey(playerId), ...topicIds]),
    ),
    includeDeviceBridge
      ? redisPipeline<Array<Array<number | string>>>(
        ids.map((playerId) => ["SMISMEMBER", deviceBridgeHistoryKey(playerId), ...topicIds]),
      )
      : Promise.resolve([]),
  ]);
  return candidates.filter((_, candidateIndex) =>
    membership.every((playerMembership) => Number(playerMembership[candidateIndex]) !== 1)
    && deviceMembership.every((playerMembership) => Number(playerMembership[candidateIndex]) !== 1)
  );
}

export async function rememberTahoiyaTopicHistory(word: string, playerIds: string[]) {
  const ids = uniquePlayerIds(playerIds);
  const topicId = getTahoiyaHistoryTopicId(word);
  if (!topicId || ids.length === 0) return;
  await redisPipeline<unknown[]>(ids.map((playerId) => ["SADD", historyKey(playerId), topicId]));
}

export async function rememberTahoiyaDeviceTopicHistory(playerId: string, topicIds: unknown) {
  const normalizedPlayerId = playerId.trim();
  const ids = normalizeTahoiyaHistoryTopicIds(topicIds);
  if (!normalizedPlayerId || ids.length === 0 || ids.some((id) => !isTahoiyaHistoryTopicId(id))) return 0;
  const key = deviceBridgeHistoryKey(normalizedPlayerId);
  await redisPipeline<unknown[]>([
    ["SADD", key, ...ids],
    ["EXPIRE", key, String(deviceBridgeTtlSeconds)],
  ]);
  return ids.length;
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
