import { getRedisConfig, redisCommand } from "@/lib/redis-store";
import {
  installRuntimeHyperparameterOverrides,
  normalizeRuntimeHyperparameterOverrides,
  type RuntimeHyperparameterId,
  type RuntimeHyperparameterOverrides,
} from "@/lib/runtime-hyperparameters-core";

const storageKey = "site-runtime-hyperparameters:v1";
const cacheDurationMs = 5_000;
let cache: { values: RuntimeHyperparameterOverrides; expiresAt: number } | null = null;

export async function loadRuntimeHyperparameterOverrides(options: { fresh?: boolean } = {}) {
  if (!options.fresh && cache && cache.expiresAt > Date.now()) return installRuntimeHyperparameterOverrides(cache.values);
  if (!getRedisConfig()) return installRuntimeHyperparameterOverrides({});
  try {
    const raw = await redisCommand<string | null>(["GET", storageKey]);
    const values = normalizeRuntimeHyperparameterOverrides(raw ? JSON.parse(raw) : {});
    cache = { values, expiresAt: Date.now() + cacheDurationMs };
    return installRuntimeHyperparameterOverrides(values);
  } catch {
    return installRuntimeHyperparameterOverrides(cache?.values ?? {});
  }
}

export async function saveRuntimeHyperparameterOverrides(changes: Partial<Record<RuntimeHyperparameterId, number | null>>) {
  if (!getRedisConfig()) throw new Error("SITE_SETTINGS_STORE_NOT_CONFIGURED");
  const current = await loadRuntimeHyperparameterOverrides({ fresh: true });
  const next: RuntimeHyperparameterOverrides = { ...current };
  for (const [id, value] of Object.entries(changes) as [RuntimeHyperparameterId, number | null][]) {
    if (value === null) delete next[id];
    else next[id] = value;
  }
  await redisCommand<"OK">(["SET", storageKey, JSON.stringify(next)]);
  cache = { values: next, expiresAt: Date.now() + cacheDurationMs };
  return installRuntimeHyperparameterOverrides(next);
}
