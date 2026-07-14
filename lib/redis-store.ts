type RedisResponse<T> = {
  result: T;
  error?: string;
};

const defaultRedisRequestTimeoutMs = 4_000;
const minimumRedisRequestTimeoutMs = 1_000;
const maximumRedisRequestTimeoutMs = 10_000;
const redisReadRetryDelayMs = 25;
const retryableRedisStatuses = new Set([429, 500, 502, 503, 504]);
const redisReadCommands = new Set([
  "EXISTS",
  "GET",
  "DBSIZE",
  "INFO",
  "HGET",
  "HGETALL",
  "HMGET",
  "MGET",
  "SCARD",
  "SCAN",
  "SISMEMBER",
  "SMEMBERS",
  "SSCAN",
  "TTL",
  "ZCARD",
  "ZRANGE",
  "ZREVRANGE",
  "ZSCORE",
]);

export function getRedisRequestTimeoutMs() {
  const configured = Number(process.env.REDIS_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return defaultRedisRequestTimeoutMs;
  return Math.min(maximumRedisRequestTimeoutMs, Math.max(minimumRedisRequestTimeoutMs, Math.round(configured)));
}

function commandName(command: unknown[]) {
  return typeof command[0] === "string" ? command[0].trim().toUpperCase() : "";
}

function commandsAreSafeToRetry(commands: unknown[][]) {
  return commands.length > 0 && commands.every((command) => redisReadCommands.has(commandName(command)));
}

function waitForRedisRetry() {
  return new Promise((resolve) => setTimeout(resolve, redisReadRetryDelayMs));
}

async function fetchRedis(url: string, token: string, body: string, retrySafe: boolean) {
  const attempts = retrySafe ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(getRedisRequestTimeoutMs()),
      });
      if (response.ok || !retrySafe || !retryableRedisStatuses.has(response.status) || attempt === attempts - 1) return response;
    } catch (error) {
      if (!retrySafe || attempt === attempts - 1) {
        if (error instanceof Error && error.name === "TimeoutError") throw new Error("REDIS_STORE_REQUEST_TIMEOUT");
        throw new Error("REDIS_STORE_REQUEST_FAILED");
      }
    }
    await waitForRedisRetry();
  }
  throw new Error("REDIS_STORE_REQUEST_FAILED");
}

export function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) return null;

  return {
    url: url.replace(/\/$/, ""),
    token,
  };
}

export async function redisCommand<T>(command: unknown[]) {
  const config = getRedisConfig();
  if (!config) {
    throw new Error("REDIS_STORE_NOT_CONFIGURED");
  }

  const response = await fetchRedis(config.url, config.token, JSON.stringify(command), redisReadCommands.has(commandName(command)));

  if (!response.ok) {
    throw new Error(`REDIS_STORE_REQUEST_FAILED_${response.status}`);
  }

  const data = (await response.json()) as RedisResponse<T>;
  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
}

export async function redisPipeline<T extends unknown[]>(commands: unknown[][]) {
  if (commands.length === 0) return [] as unknown as T;
  const config = getRedisConfig();
  if (!config) throw new Error("REDIS_STORE_NOT_CONFIGURED");

  const response = await fetchRedis(`${config.url}/pipeline`, config.token, JSON.stringify(commands), commandsAreSafeToRetry(commands));
  if (!response.ok) throw new Error(`REDIS_STORE_REQUEST_FAILED_${response.status}`);

  const data = (await response.json()) as RedisResponse<unknown>[];
  for (const item of data) {
    if (item.error) throw new Error(item.error);
  }
  return data.map((item) => item.result) as T;
}
