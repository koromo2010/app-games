export type ObservabilityLevel = "debug" | "info" | "warn" | "error";

export type ObservabilityOutcome =
  | "started"
  | "success"
  | "rejected"
  | "conflict"
  | "ignored"
  | "failed";

export const observabilityWorkClasses = [
  "critical",
  "best-effort",
] as const;

export type ObservabilityWorkClass =
  (typeof observabilityWorkClasses)[number];

export const observabilityStorageOperations = [
  "read",
  "write",
  "pipeline",
] as const;

export type ObservabilityStorageOperation =
  (typeof observabilityStorageOperations)[number];

export const observabilityStorageTransports = [
  "rest",
  "socket",
] as const;

export type ObservabilityStorageTransport =
  (typeof observabilityStorageTransports)[number];

export const observabilityStorageCommands = [
  "DBSIZE",
  "DECR",
  "DEL",
  "EVAL",
  "EVALSHA",
  "EXISTS",
  "EXPIRE",
  "GET",
  "HDEL",
  "HGET",
  "HGETALL",
  "HINCRBY",
  "HKEYS",
  "HLEN",
  "HMGET",
  "HSCAN",
  "HSET",
  "HSETNX",
  "HVALS",
  "INCR",
  "INCRBY",
  "INFO",
  "LLEN",
  "LPUSH",
  "LRANGE",
  "LREM",
  "LTRIM",
  "MGET",
  "RPUSH",
  "SADD",
  "SCAN",
  "SCARD",
  "SISMEMBER",
  "SMEMBERS",
  "SMISMEMBER",
  "SREM",
  "SSCAN",
  "SET",
  "TTL",
  "XADD",
  "XDEL",
  "XGROUP",
  "XINFO",
  "XLEN",
  "XREAD",
  "XREADGROUP",
  "XRANGE",
  "XREVRANGE",
  "XTRIM",
  "ZADD",
  "ZCARD",
  "ZINCRBY",
  "ZMSCORE",
  "ZRANGE",
  "ZREM",
  "ZREMRANGEBYRANK",
  "ZREMRANGEBYSCORE",
  "ZREVRANGE",
  "ZSCORE",
  "MULTIPLE",
  "UNKNOWN",
] as const;

export type ObservabilityStorageCommand =
  (typeof observabilityStorageCommands)[number];

/**
 * Deliberately closed field list. Game payloads, free text, secrets, words,
 * email addresses, cookies and avatar data have no place in this schema.
 */
export type ObservabilityFields = {
  game?: string;
  operation?: string;
  action?: string;
  roomRef?: string;
  actorRef?: string;
  eventRef?: string;
  commandRef?: string;
  effectRef?: string;
  phase?: string;
  channel?: string;
  packageRevision?: string;
  packageRoot?: string;
  runtimeVersion?: string;
  provider?: string;
  model?: string;
  billingSource?: string;
  tokenVersion?: string;
  sourceKind?: string;
  assetPath?: string;
  workClass?: ObservabilityWorkClass;
  storageOperation?: ObservabilityStorageOperation;
  storageTransport?: ObservabilityStorageTransport;
  storageCommand?: ObservabilityStorageCommand;
  revision?: number;
  commandRevision?: number;
  roomSchemaVersion?: number;
  playerCount?: number;
  round?: number;
  gameNumber?: number;
  statusCode?: number;
  durationMs?: number;
  retryAfterMs?: number;
  attempt?: number;
  affectedCount?: number;
  sourceCount?: number;
  commandCount?: number;
  serializedBytes?: number;
  promptTokens?: number;
  completionTokens?: number;
  costMicros?: number;
  applied?: boolean;
  debugMode?: boolean;
  outcome?: ObservabilityOutcome;
  errorCode?: string;
  databaseCode?: string;
};

export type ObservabilityEvent = {
  schemaVersion: 1;
  occurredAt: string;
  level: ObservabilityLevel;
  event: string;
  service: string;
  environment: string;
  deployment?: string;
  region?: string;
  route?: string;
  method?: string;
  requestId?: string;
  traceId?: string;
  fields: ObservabilityFields;
};

export interface ObservabilitySink {
  emit(event: ObservabilityEvent): void | Promise<void>;
}
