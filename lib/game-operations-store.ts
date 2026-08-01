import { getRedisConfig, redisCommand } from "./redis-store.ts";
import {
  defaultGameOperations,
  gameOperationFor,
  normalizeGameOperations,
  type GameOperation,
  type GameOperationDefinition,
} from "./game-operations-format.ts";
import { gameOperationsKey as environmentKey } from "./game-operations-keys.ts";
import { readGameOperationsFromRedis } from "./game-operations-read.ts";
import {
  expectedAppEnvironment,
  type AppEnvironment,
} from "./storage-environment-guard.ts";

const cacheDurationMs = 15_000;
const caches = new Map<AppEnvironment, { operations: GameOperation[]; expiresAt: number }>();
const pendingLoads = new Map<AppEnvironment, Promise<GameOperation[]>>();

export function gameOperationsKey(environment = expectedAppEnvironment()) {
  return environmentKey(environment);
}

export function updateGameOperationsCache(environment: AppEnvironment, operations: GameOperation[], now = Date.now()) {
  caches.set(environment, { operations, expiresAt: now + cacheDurationMs });
}

export async function loadGameOperations(
  options: { fresh?: boolean } = {},
  additionalGames: GameOperationDefinition[] = [],
) {
  const environment = expectedAppEnvironment();
  const cache = caches.get(environment);
  const pendingLoad = pendingLoads.get(environment);
  if (!options.fresh && cache && cache.expiresAt > Date.now()) return normalizeGameOperations(cache.operations, additionalGames);
  if (!options.fresh && pendingLoad) return normalizeGameOperations(await pendingLoad, additionalGames);
  if (!getRedisConfig()) return defaultGameOperations(additionalGames);

  const request = readGameOperationsFromRedis({
    environment,
    additionalGames,
    command: (command) => redisCommand(command as unknown[]),
  }).then((operations) => {
    updateGameOperationsCache(environment, operations);
    return operations;
  });
  if (!options.fresh) pendingLoads.set(environment, request);
  try {
    return await request;
  } catch {
    return normalizeGameOperations(
      caches.get(environment)?.operations ?? defaultGameOperations(additionalGames),
      additionalGames,
    );
  } finally {
    if (pendingLoads.get(environment) === request) pendingLoads.delete(environment);
  }
}

export async function loadGameOperation(gameId: string) {
  return gameOperationFor(await loadGameOperations(), gameId);
}
