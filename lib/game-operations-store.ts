import { getRedisConfig, redisCommand } from "@/lib/redis-store";
import { defaultGameOperations, gameOperationFor, migrateLegacyGameOperations, normalizeGameOperations, type GameOperation } from "@/lib/game-operations";
import { expectedAppEnvironment, type AppEnvironment } from "@/lib/storage-environment-guard";

const unscopedGameOperationsKey = "site-game-operations:v2";
const legacyGameOperationsKey = "site-game-operations:v1";
const cacheDurationMs = 15_000;
const caches = new Map<AppEnvironment, { operations: GameOperation[]; expiresAt: number }>();
const pendingLoads = new Map<AppEnvironment, Promise<GameOperation[]>>();

type AdditionalGame = { id: string; private?: boolean };

export function gameOperationsKey(environment = expectedAppEnvironment()) {
  return `site-game-operations:v3:${environment}`;
}

export async function loadGameOperations(
  options: { fresh?: boolean } = {},
  additionalGames: AdditionalGame[] = [],
) {
  const environment = expectedAppEnvironment();
  const cache = caches.get(environment);
  const pendingLoad = pendingLoads.get(environment);
  if (!options.fresh && cache && cache.expiresAt > Date.now()) {
    return normalizeGameOperations(cache.operations, additionalGames);
  }
  if (!options.fresh && pendingLoad) {
    return normalizeGameOperations(await pendingLoad, additionalGames);
  }
  if (!getRedisConfig()) return defaultGameOperations(additionalGames);

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
      ? normalizeGameOperations(JSON.parse(stored), additionalGames)
      : unscopedStored
        ? normalizeGameOperations(JSON.parse(unscopedStored), additionalGames)
        : legacyStored
          ? normalizeGameOperations(migrateLegacyGameOperations(JSON.parse(legacyStored)), additionalGames)
          : defaultGameOperations(additionalGames);
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

export async function saveGameOperations(
  value: GameOperation[],
  additionalGames: AdditionalGame[] = [],
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
