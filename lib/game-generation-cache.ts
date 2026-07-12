import { createHash, randomUUID } from "node:crypto";
import { redisCommand } from "@/lib/redis-store";

function cacheKey(scope: string, requestKey: string) {
  const hash = createHash("sha256").update(requestKey).digest("hex").slice(0, 32);
  return `game-generation:${scope}:${hash}`;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadCached<T>(key: string) {
  const value = await redisCommand<string | null>(["GET", key]);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Prevents duplicate clicks/tabs from spending multiple LLM calls for one room round. */
export async function withGameGenerationCache<T>(scope: string, requestKey: string, generate: () => Promise<T>) {
  if (!requestKey) return generate();
  const resultKey = cacheKey(scope, requestKey);
  const lockKey = `${resultKey}:lock`;
  const token = randomUUID();
  let acquired = false;

  try {
    const cached = await loadCached<T>(resultKey);
    if (cached) return cached;
    const lockResult = await redisCommand<"OK" | null>(["SET", lockKey, token, "NX", "EX", "180"]);
    if (lockResult !== "OK") {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await wait(500);
        const pendingResult = await loadCached<T>(resultKey);
        if (pendingResult) return pendingResult;
      }
      throw new Error("GAME_GENERATION_IN_PROGRESS");
    }
    acquired = true;
  } catch (error) {
    if (error instanceof Error && error.message === "GAME_GENERATION_IN_PROGRESS") throw error;
    return generate();
  }

  try {
    const generated = await generate();
    await redisCommand<"OK">(["SET", resultKey, JSON.stringify(generated), "EX", "86400"]);
    return generated;
  } finally {
    if (acquired) {
      await redisCommand<number>([
        "EVAL",
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
        "1",
        lockKey,
        token,
      ]).catch(() => undefined);
    }
  }
}
