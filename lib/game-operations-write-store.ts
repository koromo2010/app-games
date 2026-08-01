import { getRedisConfig, redisCommand } from "./redis-store.ts";
import {
  normalizeGameOperations,
  type GameOperation,
  type GameOperationDefinition,
} from "./game-operations-format.ts";
import { gameOperationsKey, updateGameOperationsCache } from "./game-operations-store.ts";
import { expectedAppEnvironment } from "./storage-environment-guard.ts";

export async function saveGameOperations(
  value: GameOperation[],
  additionalGames: GameOperationDefinition[] = [],
) {
  if (!getRedisConfig()) throw new Error("SITE_SETTINGS_STORE_NOT_CONFIGURED");
  const environment = expectedAppEnvironment();
  const now = Date.now();
  const operations = normalizeGameOperations(value, additionalGames)
    .map((operation) => ({ ...operation, updatedAt: now }));
  await redisCommand<"OK">(["SET", gameOperationsKey(environment), JSON.stringify(operations)]);
  updateGameOperationsCache(environment, operations, now);
  return operations;
}
