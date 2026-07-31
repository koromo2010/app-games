import { assertRedisEnvironment } from "./storage-environment-guard.ts";
import { createClient, type RedisClientType } from "redis";
import {
  observabilityStorageCommands,
  type ObservabilityFields,
  type ObservabilityStorageCommand,
  type ObservabilityStorageOperation,
  type ObservabilityStorageTransport,
} from "./observability/types.ts";

type RedisResponse<T> = {
  result: T;
  error?: string;
};

type RedisErrorResponse = {
  error?: unknown;
};

type RedisConfig =
  | { transport: "rest"; url: string; token: string; keyPrefix: string }
  | { transport: "socket"; url: string; keyPrefix: string };

type RedisStoreOperationTelemetry = {
  storageOperation: ObservabilityStorageOperation;
  storageTransport?: ObservabilityStorageTransport;
  storageCommand: ObservabilityStorageCommand;
  commandCount: number;
  serializedBytes: number;
};

export class RedisStoreOperationError extends Error {
  readonly telemetry: RedisStoreOperationTelemetry;

  constructor(
    message: string,
    telemetry: RedisStoreOperationTelemetry,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "RedisStoreOperationError";
    this.telemetry = telemetry;
  }
}

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
  "LRANGE",
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
const redisTelemetryCommands = new Set<string>(
  observabilityStorageCommands,
);

export function getRedisRequestTimeoutMs() {
  const configured = Number(process.env.REDIS_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return defaultRedisRequestTimeoutMs;
  return Math.min(maximumRedisRequestTimeoutMs, Math.max(minimumRedisRequestTimeoutMs, Math.round(configured)));
}

function commandName(command: unknown[]) {
  return typeof command[0] === "string" ? command[0].trim().toUpperCase() : "";
}

function telemetryCommandName(
  commands: unknown[][],
): ObservabilityStorageCommand {
  const names = [...new Set(commands.map(commandName).filter(Boolean))];
  if (names.length > 1) return "MULTIPLE";
  const name = names[0] ?? "";
  return redisTelemetryCommands.has(name)
    ? name as ObservabilityStorageCommand
    : "UNKNOWN";
}

function serializedByteLength(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
  } catch {
    return 0;
  }
}

function redisOperationTelemetry(
  commands: unknown[][],
  operation: ObservabilityStorageOperation,
  transport?: ObservabilityStorageTransport,
  serializedValue: unknown = commands,
): RedisStoreOperationTelemetry {
  return {
    storageOperation: operation,
    ...(transport ? { storageTransport: transport } : {}),
    storageCommand: telemetryCommandName(commands),
    commandCount: commands.length,
    serializedBytes: serializedByteLength(serializedValue),
  };
}

function redisStoreOperationError(
  error: unknown,
  telemetry: RedisStoreOperationTelemetry,
) {
  if (error instanceof RedisStoreOperationError) return error;
  const message = error instanceof Error
    ? error.message
    : "REDIS_STORE_REQUEST_FAILED";
  return new RedisStoreOperationError(message, telemetry, error);
}

export function redisStoreObservabilityFields(
  error: unknown,
): ObservabilityFields {
  return error instanceof RedisStoreOperationError
    ? error.telemetry
    : {};
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
  for (const key of ["APP_REDIS_URL", "DEV_REDIS_REDIS_URL", "REDIS_URL"]) {
    const value = env[key]?.trim();
    if (value) return { key, url: value };
  }

  const integrationUrls = Object.entries(env)
    .filter(([key, value]) => key.endsWith("_REDIS_URL") && Boolean(value?.trim()))
    .map(([key, value]) => ({ key, url: value!.trim() }));
  if (integrationUrls.length > 1) throw new Error("REDIS_STORE_URL_AMBIGUOUS");
  return integrationUrls[0] ?? null;
}

function appRedisKeyPrefix(configKey: string) {
  return configKey.startsWith("DEV_REDIS_") ? "app-dev:" : "";
}

function prefixRedisKey(value: unknown, prefix: string) {
  if (!prefix || typeof value !== "string" || value.startsWith(prefix)) return value;
  return `${prefix}${value}`;
}

const singleKeyCommands = new Set([
  "DECR", "EXPIRE", "GET", "HDEL", "HGET", "HGETALL", "HINCRBY", "HKEYS", "HLEN", "HMGET", "HSCAN",
  "HSET", "HVALS", "INCR", "INCRBY", "LLEN", "LPUSH", "LRANGE", "LREM", "LTRIM", "RPUSH", "SADD", "SCARD",
  "SISMEMBER", "SMEMBERS", "SMISMEMBER", "SREM", "SSCAN", "SET", "TTL", "ZADD", "ZCARD", "ZINCRBY",
  "ZMSCORE", "ZRANGE", "ZREM", "ZREVRANGE", "ZSCORE",
]);
const allKeyCommands = new Set(["DEL", "EXISTS", "MGET"]);

export function namespaceRedisCommand(command: unknown[], prefix: string) {
  if (!prefix || command.length === 0) return command;
  const namespaced = [...command];
  const name = commandName(namespaced);
  if (singleKeyCommands.has(name)) {
    namespaced[1] = prefixRedisKey(namespaced[1], prefix);
  } else if (allKeyCommands.has(name)) {
    for (let index = 1; index < namespaced.length; index += 1) namespaced[index] = prefixRedisKey(namespaced[index], prefix);
  } else if (name === "EVAL" || name === "EVALSHA") {
    const keyCount = Number(namespaced[2]);
    if (Number.isInteger(keyCount) && keyCount >= 0) {
      for (let index = 3; index < 3 + keyCount && index < namespaced.length; index += 1) {
        namespaced[index] = prefixRedisKey(namespaced[index], prefix);
      }
    }
  } else if (name === "SCAN") {
    for (let index = 2; index < namespaced.length - 1; index += 1) {
      if (String(namespaced[index]).toUpperCase() === "MATCH") {
        namespaced[index + 1] = prefixRedisKey(namespaced[index + 1], prefix);
      }
    }
  }
  return namespaced;
}

export function getRedisConfig() {
  const devUrl = process.env.DEV_REDIS_KV_REST_API_URL;
  const devToken = process.env.DEV_REDIS_KV_REST_API_TOKEN;
  const usesDevIntegration = Boolean(devUrl && devToken);
  const url = usesDevIntegration ? devUrl : process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = usesDevIntegration ? devToken : process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (url && token) {
    assertRedisEnvironment();
    return {
      transport: "rest",
      url: url.replace(/\/$/, ""),
      token,
      keyPrefix: usesDevIntegration ? "app-dev:" : "",
    } satisfies RedisConfig;
  }

  const socketConfig = resolveSocketRedisUrl();
  if (!socketConfig) return null;
  assertRedisEnvironment();

  return {
    transport: "socket",
    url: socketConfig.url,
    keyPrefix: appRedisKeyPrefix(socketConfig.key),
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

async function redisRequestError(response: Response) {
  let providerMessage = "";
  try {
    const payload = await response.json() as RedisErrorResponse;
    providerMessage = typeof payload.error === "string" ? payload.error.toLowerCase() : "";
  } catch {
    // The HTTP status remains useful even when the provider did not return JSON.
  }

  if (providerMessage.includes("max daily request limit exceeded") || providerMessage.includes("max requests limit exceeded")) {
    return new Error("REDIS_STORE_REQUEST_LIMIT_EXCEEDED");
  }
  if (providerMessage.includes("max request size exceeded")) {
    return new Error("REDIS_STORE_REQUEST_SIZE_EXCEEDED");
  }
  return new Error(`REDIS_STORE_REQUEST_FAILED_${response.status}`);
}

export function isRedisStoreUnavailableError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message === "REDIS_STORE_REQUEST_TIMEOUT"
    || error.message === "REDIS_STORE_REQUEST_FAILED"
    || error.message === "REDIS_STORE_REQUEST_LIMIT_EXCEEDED"
    || error.message.startsWith("REDIS_STORE_REQUEST_FAILED_");
}

export async function redisCommand<T>(command: unknown[]) {
  const operation: ObservabilityStorageOperation = redisReadCommands.has(
    commandName(command),
  )
    ? "read"
    : "write";
  let config: RedisConfig | null;
  try {
    config = getRedisConfig();
  } catch (error) {
    throw redisStoreOperationError(
      error,
      redisOperationTelemetry([command], operation),
    );
  }
  if (!config) {
    throw new RedisStoreOperationError(
      "REDIS_STORE_NOT_CONFIGURED",
      redisOperationTelemetry([command], operation),
    );
  }

  const namespacedCommand = namespaceRedisCommand(
    command,
    config.keyPrefix,
  );
  const telemetry = redisOperationTelemetry(
    [command],
    operation,
    config.transport,
    namespacedCommand,
  );
  try {
    if (config.transport === "socket") {
      const client = await getSocketRedisClient(config.url);
      return await client.sendCommand(
        stringifyRedisCommand(namespacedCommand),
      ) as T;
    }

    const body = JSON.stringify(namespacedCommand);
    const response = await fetchRedis(
      config.url,
      config.token,
      body,
      redisReadCommands.has(commandName(command)),
    );

    if (!response.ok) {
      throw await redisRequestError(response);
    }

    const data = (await response.json()) as RedisResponse<T>;
    if (data.error) {
      throw new Error(data.error);
    }

    return data.result;
  } catch (error) {
    throw redisStoreOperationError(error, telemetry);
  }
}

export async function redisPipeline<T extends unknown[]>(commands: unknown[][]) {
  if (commands.length === 0) return [] as unknown as T;
  let config: RedisConfig | null;
  try {
    config = getRedisConfig();
  } catch (error) {
    throw redisStoreOperationError(
      error,
      redisOperationTelemetry(commands, "pipeline"),
    );
  }
  if (!config) {
    throw new RedisStoreOperationError(
      "REDIS_STORE_NOT_CONFIGURED",
      redisOperationTelemetry(commands, "pipeline"),
    );
  }

  const namespacedCommands = commands.map((command) => (
    namespaceRedisCommand(command, config.keyPrefix)
  ));
  const telemetry = redisOperationTelemetry(
    commands,
    "pipeline",
    config.transport,
    namespacedCommands,
  );
  try {
    if (config.transport === "socket") {
      const client = await getSocketRedisClient(config.url);
      const transaction = client.multi();
      for (const command of namespacedCommands) {
        transaction.addCommand(stringifyRedisCommand(command));
      }
      return await transaction.exec() as T;
    }

    const response = await fetchRedis(
      `${config.url}/pipeline`,
      config.token,
      JSON.stringify(namespacedCommands),
      commandsAreSafeToRetry(commands),
    );
    if (!response.ok) throw await redisRequestError(response);

    const data = (await response.json()) as RedisResponse<unknown>[];
    for (const item of data) {
      if (item.error) throw new Error(item.error);
    }
    return data.map((item) => item.result) as T;
  } catch (error) {
    throw redisStoreOperationError(error, telemetry);
  }
}
