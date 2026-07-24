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
  await redisCommand<string>([
    "SET",
    key(playerId, gameId),
    JSON.stringify(settings),
    "EX",
    String(retentionSeconds),
  ]);
  return settings;
}
