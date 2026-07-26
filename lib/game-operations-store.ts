import { getRedisConfig, redisCommand } from "@/lib/redis-store";
import { defaultGameOperations, gameOperationFor, migrateLegacyGameOperations, normalizeGameOperations, type GameOperation } from "@/lib/game-operations";
import { expectedAppEnvironment, type AppEnvironment } from "@/lib/storage-environment-guard";

const unscopedGameOperationsKey = "site-game-operations:v2";
const legacyGameOperationsKey = "site-game-operations:v1";
const cacheDurationMs = 15_000;
const caches = new Map<AppEnvironment, { operations: GameOperation[]; expiresAt: number }>();
const pendingLoads = new Map<AppEnvironment, Promise<GameOperation[]>>();

export function gameOperationsKey(environment = expectedAppEnvironment()) {
  return `site-game-operations:v3:${environment}`;
}

export async function loadGameOperations(options: { fresh?: boolean } = {}) {
  const environment = expectedAppEnvironment();
  const cache = caches.get(environment);
  const pendingLoad = pendingLoads.get(environment);
  if (!options.fresh && cache && cache.expiresAt > Date.now()) return cache.operations;
  if (!options.fresh && pendingLoad) return pendingLoad;
  if (!getRedisConfig()) return defaultGameOperations();

  const request = (async () => {
    const scopedKey = gameOperationsKey(environment);
    const stored = await redisCommand<string | null>(["GET", scopedKey]);
    const unscopedStored = stored
      ? null
      : await redisCommand<string | null>(["GET", unscopedGameOperationsKey]);
    const legacyStored = stored || unscopedStored
      ? null
      : await redisCommand<string | null>(["GET", legacyGameOperationsKey]);
    const operations = stored
      ? normalizeGameOperations(JSON.parse(stored))
      : unscopedStored
        ? normalizeGameOperations(JSON.parse(unscopedStored))
        : legacyStored
          ? migrateLegacyGameOperations(JSON.parse(legacyStored))
          : defaultGameOperations();
    if (!stored && (unscopedStored || legacyStored)) {
      await redisCommand<"OK">(["SET", scopedKey, JSON.stringify(operations)]);
    }
    caches.set(environment, { operations, expiresAt: Date.now() + cacheDurationMs });
    return operations;
  })();
  if (!options.fresh) pendingLoads.set(environment, request);
  try {
    return await request;
  } catch {
    return caches.get(environment)?.operations ?? defaultGameOperations();
  } finally {
    if (pendingLoads.get(environment) === request) pendingLoads.delete(environment);
  }
}

export async function loadGameOperation(gameId: string) {
  return gameOperationFor(await loadGameOperations(), gameId);
}

export async function saveGameOperations(
  value: GameOperation[],
  additionalGames: Array<{ id: string; private?: boolean }> = [],
) {
  if (!getRedisConfig()) throw new Error("SITE_SETTINGS_STORE_NOT_CONFIGURED");
  const environment = expectedAppEnvironment();
  const now = Date.now();
  const operations = normalizeGameOperations(value, additionalGames)
    .map((operation) => ({ ...operation, updatedAt: now }));
  await redisCommand<"OK">(["SET", gameOperationsKey(environment), JSON.stringify(operations)]);
  caches.set(environment, { operations, expiresAt: now + cacheDurationMs });
  return operations;
}
