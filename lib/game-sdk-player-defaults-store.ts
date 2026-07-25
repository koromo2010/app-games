import {
  gameSdkSettingOptionValue,
  type GameSdkSettingDefinition,
  type GameSdkSettingValue,
} from "@game-fields/game-sdk";
import { redisCommand } from "./redis-store.ts";

const retentionSeconds = 2 * 365 * 24 * 60 * 60;

function key(playerId: string, gameId: string) {
  return `game-sdk-player-defaults:v1:${playerId}:${gameId}`;
}

function indexKey(playerId: string) {
  return `game-sdk-player-defaults-index:v1:${playerId}`;
}

export function normalizeGameSdkPlayerDefaults(
  input: unknown,
  definitions: readonly GameSdkSettingDefinition[],
) {
  const source = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  const normalized: Record<string, GameSdkSettingValue> = {};
  for (const definition of definitions) {
    const value = source[definition.key];
    if (definition.type === "boolean" && typeof value === "boolean") {
      normalized[definition.key] = value;
      continue;
    }
    if (definition.type === "text" && typeof value === "string") {
      normalized[definition.key] = value.trim().slice(0, 200);
      continue;
    }
    if (
      definition.type === "number"
      && typeof value === "number"
      && Number.isFinite(value)
    ) {
      normalized[definition.key] = Math.min(
        definition.maximum ?? value,
        Math.max(definition.minimum ?? value, value),
      );
      continue;
    }
    if (definition.type === "select" && definition.options) {
      const option = definition.options.find(
        (candidate) => gameSdkSettingOptionValue(candidate) === value,
      );
      if (option) normalized[definition.key] = gameSdkSettingOptionValue(option);
    }
  }
  return normalized;
}

export async function loadGameSdkPlayerDefaults(
  playerId: string,
  gameId: string,
  definitions: readonly GameSdkSettingDefinition[],
) {
  const raw = await redisCommand<string | null>(["GET", key(playerId, gameId)]);
  if (!raw) return {};
  try {
    return normalizeGameSdkPlayerDefaults(JSON.parse(raw), definitions);
  } catch {
    return {};
  }
}

export async function saveGameSdkPlayerDefaults(
  playerId: string,
  gameId: string,
  definitions: readonly GameSdkSettingDefinition[],
  input: unknown,
) {
  const settings = normalizeGameSdkPlayerDefaults(input, definitions);
  await redisCommand<number>([
    "EVAL",
    "redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2]); redis.call('SADD',KEYS[2],ARGV[3]); redis.call('EXPIRE',KEYS[2],ARGV[2]); return 1",
    "2",
    key(playerId, gameId),
    indexKey(playerId),
    JSON.stringify(settings),
    String(retentionSeconds),
    gameId,
  ]);
  return settings;
}

export async function deleteGameSdkPlayerDefaults(playerId: string) {
  const gameIds = await redisCommand<string[]>(["SMEMBERS", indexKey(playerId)]);
  return redisCommand<number>([
    "DEL",
    indexKey(playerId),
    ...gameIds.map((gameId) => key(playerId, gameId)),
  ]);
}
