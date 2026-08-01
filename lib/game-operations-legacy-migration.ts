import {
  gameOperationMessageMaxLength,
  isStoredGameOperationId,
  migrateLegacyGameOperations,
  normalizeGameOperationMessage,
  normalizeGameOperations,
  type GameOperation,
} from "./game-operations-format.ts";
import {
  gameOperationsKey,
  gameOperationsNamespace,
  legacyGameOperationsKey,
  unscopedGameOperationsKey,
} from "./game-operations-keys.ts";
import type { AppEnvironment } from "./storage-environment-guard.ts";

type SourceVersion = "v2" | "v1";
type Command = (command: readonly string[]) => Promise<unknown>;

const V2_FIELDS = ["gameId", "maintenance", "message", "publication", "updatedAt"];
const V1_FIELDS = ["gameId", "message", "mode", "updatedAt"];

function invalid(detail: string): never {
  throw new Error(`GAME_OPERATIONS_MIGRATION_SOURCE_INVALID:${detail}`);
}

function exactFields(value: Record<string, unknown>, wanted: readonly string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === wanted.length
    && actual.every((field, index) => field === wanted[index]);
}

function validUpdatedAt(value: unknown) {
  return value === null
    || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

function validateMessage(value: unknown) {
  return typeof value === "string"
    && value.length <= gameOperationMessageMaxLength
    && normalizeGameOperationMessage(value) === value;
}

export function validateLegacyGameOperationsRaw(
  version: SourceVersion,
  value: unknown,
  options: { knownV1GameIds: readonly string[] },
): GameOperation[] {
  if (!Array.isArray(value) || value.length === 0) invalid(`${version}:array`);
  const knownV1Ids = new Set(options.knownV1GameIds);
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid(`${version}:object`);
    const input = item as Record<string, unknown>;
    if (!exactFields(input, version === "v2" ? V2_FIELDS : V1_FIELDS)) invalid(`${version}:fields`);
    if (typeof input.gameId !== "string" || ids.has(input.gameId)) invalid(`${version}:gameId`);
    if (version === "v2" ? !isStoredGameOperationId(input.gameId) : !knownV1Ids.has(input.gameId)) invalid(`${version}:gameId`);
    if (!validateMessage(input.message)) invalid(`${version}:message`);
    if (!validUpdatedAt(input.updatedAt)) invalid(`${version}:updatedAt`);
    if (version === "v2") {
      if (input.publication !== "public" && input.publication !== "private" && input.publication !== "hidden") invalid("v2:publication");
      if (typeof input.maintenance !== "boolean") invalid("v2:maintenance");
    } else if (input.mode !== "open" && input.mode !== "maintenance" && input.mode !== "hidden") {
      invalid("v1:mode");
    }
    ids.add(input.gameId);
  }
  return version === "v2"
    ? normalizeGameOperations(value)
    : migrateLegacyGameOperations(value);
}

function parseRaw(version: SourceVersion, value: unknown, knownV1GameIds: readonly string[]) {
  if (typeof value !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    invalid(`${version}:json`);
  }
  return validateLegacyGameOperationsRaw(version, parsed, { knownV1GameIds });
}

function payload(value: GameOperation[]) {
  return JSON.stringify(value);
}

export async function migrateGameOperationsRedis(input: {
  environment: AppEnvironment;
  namespace: string;
  targetKey: string;
  apply: boolean;
  knownV1GameIds: readonly string[];
  command: Command;
}) {
  const expectedTarget = gameOperationsKey(input.environment);
  if (input.namespace !== gameOperationsNamespace || input.targetKey !== expectedTarget) {
    throw new Error("GAME_OPERATIONS_MIGRATION_SCOPE_INVALID");
  }
  const keys = [expectedTarget, unscopedGameOperationsKey, legacyGameOperationsKey] as const;
  const raw = new Map<string, unknown>();
  for (const key of keys) raw.set(key, await input.command(["GET", key]));
  for (const key of keys) {
    if (raw.get(key) !== null && raw.get(key) !== undefined) {
      const ttl = await input.command(["TTL", key]);
      if (ttl !== -1) throw new Error(`GAME_OPERATIONS_MIGRATION_TTL_INVALID:${key}`);
    }
  }

  const target = parseRaw("v2", raw.get(expectedTarget), input.knownV1GameIds);
  const v2 = parseRaw("v2", raw.get(unscopedGameOperationsKey), input.knownV1GameIds);
  const v1 = parseRaw("v1", raw.get(legacyGameOperationsKey), input.knownV1GameIds);
  const sources = ([
    v2 && { name: "v2" as const, operations: v2 },
    v1 && { name: "v1" as const, operations: v1 },
  ]).filter(Boolean) as Array<{ name: SourceVersion; operations: GameOperation[] }>;
  if (sources.length === 2 && payload(sources[0]!.operations) !== payload(sources[1]!.operations)) {
    throw new Error("GAME_OPERATIONS_MIGRATION_SOURCE_CONFLICT");
  }
  const source = sources[0] ?? null;
  if (target) {
    if (source && payload(target) !== payload(source.operations)) {
      throw new Error("GAME_OPERATIONS_MIGRATION_TARGET_CONFLICT");
    }
    return { status: "already-current", apply: input.apply, source: source?.name ?? "v3", created: 0 } as const;
  }
  if (!source) return { status: "no-source", apply: input.apply, source: null, created: 0 } as const;
  if (!input.apply) return { status: "ready", apply: false, source: source.name, created: 0 } as const;

  const serialized = payload(source.operations);
  const result = await input.command(["SET", expectedTarget, serialized, "NX"]);
  if (result === "OK") return { status: "created", apply: true, source: source.name, created: 1 } as const;
  const concurrentRaw = await input.command(["GET", expectedTarget]);
  if (concurrentRaw !== null && concurrentRaw !== undefined) {
    const concurrentTtl = await input.command(["TTL", expectedTarget]);
    if (concurrentTtl !== -1) throw new Error(`GAME_OPERATIONS_MIGRATION_TTL_INVALID:${expectedTarget}`);
  }
  const concurrent = parseRaw("v2", concurrentRaw, input.knownV1GameIds);
  if (concurrent && payload(concurrent) === serialized) {
    return { status: "concurrent-created", apply: true, source: source.name, created: 0 } as const;
  }
  throw new Error("GAME_OPERATIONS_MIGRATION_NX_CONFLICT");
}
