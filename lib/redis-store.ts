import { assertRedisEnvironment } from "./storage-environment-guard.ts";
import { createClient, type RedisClientType } from "redis";

type RedisResponse<T> = {
  result: T;
  error?: string;
};

type RedisConfig =
  | { transport: "rest"; url: string; token: string }
  | { transport: "socket"; url: string };

let socketClient: RedisClientType | null = null;
let socketClientUrl = "";
let socketConnectPromise: Promise<RedisClientType> | null = null;

type RedisEnvironment = Record<string, string | undefined>;

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
  "HKEYS",
  "HLEN",
  "HSCAN",
  "HVALS",
  "HMGET",
  "MGET",
  "SCARD",
  "SCAN",
  "SISMEMBER",
  "SMISMEMBER",
  "SMEMBERS",
  "SSCAN",
  "TTL",
  "ZCARD",
  "ZRANGE",
  "ZREVRANGE",
  "ZSCORE",
  "ZMSCORE",
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

export function resolveSocketRedisUrl(env: RedisEnvironment = process.env) {
  for (const key of ["APP_REDIS_URL", "REDIS_URL"]) {
    const value = env[key]?.trim();
    if (value) return { key, url: value };
  }

  const integrationUrls = Object.entries(env)
    .filter(([key, value]) => key.endsWith("_REDIS_URL") && Boolean(value?.trim()))
    .map(([key, value]) => ({ key, url: value!.trim() }));
  if (integrationUrls.length > 1) throw new Error("REDIS_STORE_URL_AMBIGUOUS");
  return integrationUrls[0] ?? null;
}

export function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (url && token) {
    assertRedisEnvironment();
    return {
      transport: "rest",
      url: url.replace(/\/$/, ""),
      token,
    } satisfies RedisConfig;
  }

  const socketConfig = resolveSocketRedisUrl();
  if (!socketConfig) return null;
  assertRedisEnvironment();

  return {
    transport: "socket",
    url: socketConfig.url,
  } satisfies RedisConfig;
}

async function getSocketRedisClient(url: string) {
  if (socketClient && socketClientUrl === url && socketClient.isReady) return socketClient;
  if (!socketClient || socketClientUrl !== url) {
    if (socketClient?.isOpen) await socketClient.close().catch(() => undefined);
    socketClient = createClient({ url });
    socketClientUrl = url;
    socketConnectPromise = null;
  }
  if (!socketConnectPromise) {
    const currentClient = socketClient;
    socketConnectPromise = currentClient.connect()
      .then(() => currentClient)
      .catch((error) => {
        socketConnectPromise = null;
        throw error;
      });
  }
  return socketConnectPromise;
}

function stringifyRedisCommand(command: unknown[]) {
  return command.map((part) => typeof part === "string" ? part : String(part));
}

export async function redisCommand<T>(command: unknown[]) {
  const config = getRedisConfig();
  if (!config) {
    throw new Error("REDIS_STORE_NOT_CONFIGURED");
  }

  if (config.transport === "socket") {
    const client = await getSocketRedisClient(config.url);
    return await client.sendCommand(stringifyRedisCommand(command)) as T;
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

  if (config.transport === "socket") {
    const client = await getSocketRedisClient(config.url);
    const transaction = client.multi();
    for (const command of commands) transaction.addCommand(stringifyRedisCommand(command));
    return await transaction.exec() as T;
  }

  const response = await fetchRedis(`${config.url}/pipeline`, config.token, JSON.stringify(commands), commandsAreSafeToRetry(commands));
  if (!response.ok) throw new Error(`REDIS_STORE_REQUEST_FAILED_${response.status}`);

  const data = (await response.json()) as RedisResponse<unknown>[];
  for (const item of data) {
    if (item.error) throw new Error(item.error);
  }
  return data.map((item) => item.result) as T;
}
