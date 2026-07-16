import { randomUUID } from "node:crypto";
import { getRedisConfig, redisCommand, redisPipeline } from "@/lib/redis-store";
import { normalizeWebVitalInput, type WebVitalSample } from "@/lib/web-vitals";

const webVitalsKey = "web-vitals:v1";
const retentionMs = 7 * 24 * 60 * 60 * 1_000;
const maximumSamples = 5_000;

export async function recordWebVital(value: unknown) {
  if (!getRedisConfig()) return null;
  const normalized = normalizeWebVitalInput(value);
  if (!normalized) return null;
  const sample: WebVitalSample = { ...normalized, id: randomUUID(), occurredAt: Date.now() };
  await redisPipeline([
    ["ZADD", webVitalsKey, String(sample.occurredAt), JSON.stringify(sample)],
    ["ZREMRANGEBYSCORE", webVitalsKey, "-inf", String(Date.now() - retentionMs)],
    ["ZREMRANGEBYRANK", webVitalsKey, "0", String(-(maximumSamples + 1))],
    ["EXPIRE", webVitalsKey, String(Math.ceil(retentionMs / 1_000))],
  ]);
  return sample;
}

function parseSample(raw: string): WebVitalSample | null {
  try {
    const input = JSON.parse(raw) as Partial<WebVitalSample>;
    const normalized = normalizeWebVitalInput(input);
    if (!normalized || typeof input.id !== "string" || typeof input.occurredAt !== "number") return null;
    return { ...normalized, id: input.id, occurredAt: input.occurredAt };
  } catch {
    return null;
  }
}

export async function loadWebVitalSamples(limit = 1_000) {
  if (!getRedisConfig()) return [];
  const raw = await redisCommand<string[]>(["ZREVRANGE", webVitalsKey, "0", String(Math.max(0, Math.min(maximumSamples, limit) - 1))]);
  return raw.map(parseSample).filter((sample): sample is WebVitalSample => Boolean(sample));
}
