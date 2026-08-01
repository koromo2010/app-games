import {
  defaultGameOperations,
  migrateLegacyGameOperations,
  normalizeGameOperations,
  type GameOperation,
  type GameOperationDefinition,
} from "./game-operations-format.ts";
import {
  gameOperationsKey,
  legacyGameOperationsKey,
  unscopedGameOperationsKey,
} from "./game-operations-keys.ts";
import type { AppEnvironment } from "./storage-environment-guard.ts";

export type GameOperationsRedisCommand = (
  command: readonly string[],
) => Promise<unknown>;

function parseStoredArray(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error("GAME_OPERATIONS_STORED_VALUE_INVALID");
  return parsed;
}

/** Pure read contract: only GET is reachable from this function. */
export async function readGameOperationsFromRedis(input: {
  environment: AppEnvironment;
  additionalGames?: GameOperationDefinition[];
  command: GameOperationsRedisCommand;
}): Promise<GameOperation[]> {
  const additionalGames = input.additionalGames ?? [];
  const current = parseStoredArray(await input.command([
    "GET",
    gameOperationsKey(input.environment),
  ]));
  if (current) return normalizeGameOperations(current, additionalGames);

  const unscoped = parseStoredArray(await input.command([
    "GET",
    unscopedGameOperationsKey,
  ]));
  if (unscoped) return normalizeGameOperations(unscoped, additionalGames);

  const legacy = parseStoredArray(await input.command([
    "GET",
    legacyGameOperationsKey,
  ]));
  if (legacy) {
    return normalizeGameOperations(
      migrateLegacyGameOperations(legacy),
      additionalGames,
    );
  }
  return defaultGameOperations(additionalGames);
}
