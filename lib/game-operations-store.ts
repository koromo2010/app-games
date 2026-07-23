import { getRedisConfig, redisCommand } from "@/lib/redis-store";
import { defaultGameOperations, gameOperationFor, migrateLegacyGameOperations, normalizeGameOperations, type GameOperation } from "@/lib/game-operations";

const gameOperationsKey = "site-game-operations:v2";
const legacyGameOperationsKey = "site-game-operations:v1";
const cacheDurationMs = 15_000;
let cache: { operations: GameOperation[]; expiresAt: number } | null = null;
let pendingLoad: Promise<GameOperation[]> | null = null;

export async function loadGameOperations(options: { fresh?: boolean } = {}) {
  if (!options.fresh && cache && cache.expiresAt > Date.now()) return cache.operations;
  if (!options.fresh && pendingLoad) return pendingLoad;
  if (!getRedisConfig()) return defaultGameOperations();

  const request = (async () => {
    const stored = await redisCommand<string | null>(["GET", gameOperationsKey]);
    const legacyStored = stored ? null : await redisCommand<string | null>(["GET", legacyGameOperationsKey]);
    const operations = stored
      ? normalizeGameOperations(JSON.parse(stored))
      : legacyStored ? migrateLegacyGameOperations(JSON.parse(legacyStored)) : defaultGameOperations();
    cache = { operations, expiresAt: Date.now() + cacheDurationMs };
    return operations;
  })();
  if (!options.fresh) pendingLoad = request;
  try {
    return await request;
  } catch {
    return cache?.operations ?? defaultGameOperations();
  } finally {
    if (pendingLoad === request) pendingLoad = null;
  }
}

export async function loadGameOperation(gameId: string) {
  return gameOperationFor(await loadGameOperations(), gameId);
}

export async function saveGameOperations(value: GameOperation[]) {
  if (!getRedisConfig()) throw new Error("SITE_SETTINGS_STORE_NOT_CONFIGURED");
  const now = Date.now();
  const operations = normalizeGameOperations(value).map((operation) => ({ ...operation, updatedAt: now }));
  await redisCommand<"OK">(["SET", gameOperationsKey, JSON.stringify(operations)]);
  cache = { operations, expiresAt: now + cacheDurationMs };
  return operations;
}
