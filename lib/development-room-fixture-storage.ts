import { createHash } from "node:crypto";
import {
  developmentRoomFixtureBaselineMaximum,
  developmentRoomFixtureReceiptTtlSeconds,
  developmentRoomFixtureTargetMaximum,
  type DevelopmentRoomFixtureState,
} from "./development-room-fixture-contract.ts";
import {
  loadOnlineRoomValues,
  scanOnlineRoomCodes,
} from "./online-room-list.ts";
import { redisCommand, redisPipeline } from "./redis-store.ts";

export type DevelopmentRoomFixtureSurface = "built-in:hodoai" | "sdk-preview:link-lines";

export type DevelopmentRoomFixtureKind =
  | "expired"
  | "started"
  | "full"
  | "locale-mismatch"
  | "package-mismatch"
  | "joinable-ja"
  | "joinable-en"
  | "joinable-sdk";

export type DevelopmentRoomFixtureTarget = {
  surface: DevelopmentRoomFixtureSurface;
  code: string;
  roomIdentity: string;
  publicIdentity: string;
  kind: DevelopmentRoomFixtureKind;
  cleaned: boolean;
};

export type DevelopmentRoomFixtureBaseline = {
  surface: DevelopmentRoomFixtureSurface;
  indexMembers: string[];
  roomDigests: Record<string, string | null>;
  digest: string;
};

export type DevelopmentRoomFixtureVerification = {
  builtInIndexMembers: number;
  sdkIndexMembers: number;
  builtInFirstStoragePageFiltered: boolean;
  sdkFirstStoragePageFiltered: boolean;
  builtInLaterJoinableJa: boolean;
  builtInLaterJoinableEn: boolean;
  sdkLaterJoinable: boolean;
  targetCleanupConfirmed?: boolean;
  baselineUnchanged?: boolean;
};

export type DevelopmentRoomFixtureOperation = {
  schemaVersion: 1;
  namespace: string;
  operationId: string;
  scenario: string;
  creatorSlug: string;
  actorDigest: string;
  state: DevelopmentRoomFixtureState;
  createdAt: number;
  expiresAt: number;
  surfaces: Record<DevelopmentRoomFixtureSurface, {
    indexKey: string;
    roomKeyPrefix: string;
  }>;
  baselines: Record<DevelopmentRoomFixtureSurface, DevelopmentRoomFixtureBaseline>;
  targets: DevelopmentRoomFixtureTarget[];
  verification?: DevelopmentRoomFixtureVerification;
  errorCode?: string;
};

export type DevelopmentRoomFixtureAppendInput = {
  target: DevelopmentRoomFixtureTarget;
  indexKey: string;
  roomKey: string;
  raw: string;
  roomTtlSeconds: number;
};

export type DevelopmentRoomFixtureStorage = {
  read(operationKey: string): Promise<DevelopmentRoomFixtureOperation | null>;
  begin(
    operationKey: string,
    operation: DevelopmentRoomFixtureOperation,
  ): Promise<{ created: boolean; operation: DevelopmentRoomFixtureOperation }>;
  replace(
    operationKey: string,
    expectedStates: DevelopmentRoomFixtureState[],
    operation: DevelopmentRoomFixtureOperation,
  ): Promise<DevelopmentRoomFixtureOperation>;
  captureBaseline(
    surface: DevelopmentRoomFixtureSurface,
    indexKey: string,
    roomKey: (code: string) => string,
  ): Promise<DevelopmentRoomFixtureBaseline>;
  append(
    operationKey: string,
    inputs: DevelopmentRoomFixtureAppendInput[],
  ): Promise<Array<"created" | "conflict">>;
  replaceTarget(
    operationKey: string,
    target: DevelopmentRoomFixtureTarget,
    roomKey: string,
    raw: string,
    roomTtlSeconds: number,
    nextKind: DevelopmentRoomFixtureKind,
  ): Promise<void>;
  scanPage(
    indexKey: string,
    roomKey: (code: string) => string,
    cursor: string,
  ): Promise<{ codes: string[]; values: Array<string | null>; nextCursor: string | null }>;
  indexMembers(indexKey: string): Promise<string[]>;
  roomValue(roomKey: string): Promise<string | null>;
  indexHas(indexKey: string, code: string): Promise<boolean>;
  cleanup(
    operationKey: string,
    inputs: Array<{
      target: DevelopmentRoomFixtureTarget;
      indexKey: string;
      roomKey: string;
    }>,
  ): Promise<Array<"cleaned" | "identity-mismatch">>;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseOperation(raw: string | null) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as DevelopmentRoomFixtureOperation;
    if (
      value?.schemaVersion !== 1
      || !Array.isArray(value.targets)
      || !value.baselines
      || !value.surfaces
    ) return null;
    return value;
  } catch {
    return null;
  }
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

const appendTargetLua = [
  "local raw=redis.call('GET',KEYS[1])",
  "if not raw then return -2 end",
  "local op=cjson.decode(raw)",
  "if op.state~='materializing' then return -3 end",
  `if #(op.targets or {})>=${developmentRoomFixtureTargetMaximum} then return -4 end`,
  "if redis.call('EXISTS',KEYS[2])==1 then return 0 end",
  "redis.call('SET',KEYS[2],ARGV[1],'EX',ARGV[4])",
  "redis.call('SADD',KEYS[3],ARGV[2])",
  "table.insert(op.targets,cjson.decode(ARGV[3]))",
  "redis.call('SET',KEYS[1],cjson.encode(op),'EX',ARGV[5])",
  "return 1",
].join("; ");

const replaceTargetLua = [
  "local opRaw=redis.call('GET',KEYS[1])",
  "if not opRaw then return -2 end",
  "local op=cjson.decode(opRaw)",
  "if op.state~='materializing' then return -3 end",
  "local roomRaw=redis.call('GET',KEYS[2])",
  "if not roomRaw then return 0 end",
  "local room=cjson.decode(roomRaw)",
  "local identity=room.roomInstanceId or room.creationRequestId",
  "if identity~=ARGV[1] then return 0 end",
  "local found=false",
  "for _,target in ipairs(op.targets or {}) do if target.publicIdentity==ARGV[2] then target.kind=ARGV[3]; found=true end end",
  "if not found then return -4 end",
  "redis.call('SET',KEYS[2],ARGV[4],'EX',ARGV[5])",
  "redis.call('SET',KEYS[1],cjson.encode(op),'EX',ARGV[6])",
  "return 1",
].join("; ");

const cleanupTargetLua = [
  "local opRaw=redis.call('GET',KEYS[1])",
  "if not opRaw then return -2 end",
  "local op=cjson.decode(opRaw)",
  "if op.state~='cleaning' and op.state~='cleaned' then return -3 end",
  "local roomRaw=redis.call('GET',KEYS[2])",
  "if roomRaw then",
  "  local room=cjson.decode(roomRaw)",
  "  local identity=room.roomInstanceId or room.creationRequestId",
  "  if identity~=ARGV[1] then return 0 end",
  "  redis.call('DEL',KEYS[2])",
  "end",
  "redis.call('SREM',KEYS[3],ARGV[2])",
  "for _,target in ipairs(op.targets or {}) do if target.publicIdentity==ARGV[3] then target.cleaned=true end end",
  "redis.call('SET',KEYS[1],cjson.encode(op),'EX',ARGV[4])",
  "return 1",
].join("; ");

export class RedisDevelopmentRoomFixtureStorage
implements DevelopmentRoomFixtureStorage {
  async read(operationKey: string) {
    return parseOperation(await redisCommand<string | null>(["GET", operationKey]));
  }

  async begin(
    operationKey: string,
    operation: DevelopmentRoomFixtureOperation,
  ) {
    const created = await redisCommand<string | null>([
      "SET",
      operationKey,
      JSON.stringify(operation),
      "NX",
      "EX",
      String(developmentRoomFixtureReceiptTtlSeconds),
    ]);
    if (created) return { created: true, operation };
    const existing = await this.read(operationKey);
    if (!existing) throw new Error("DEVELOPMENT_ROOM_FIXTURE_RECEIPT_INVALID");
    return { created: false, operation: existing };
  }

  async replace(
    operationKey: string,
    expectedStates: DevelopmentRoomFixtureState[],
    operation: DevelopmentRoomFixtureOperation,
  ) {
    const saved = await redisCommand<number>([
      "EVAL",
      "local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end; local current=cjson.decode(raw); local allowed=false; for _,state in ipairs(cjson.decode(ARGV[1])) do if current.state==state then allowed=true end end; if not allowed then return -1 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
      "1",
      operationKey,
      JSON.stringify(expectedStates),
      JSON.stringify(operation),
      String(developmentRoomFixtureReceiptTtlSeconds),
    ]);
    if (saved === 1) return operation;
    const current = await this.read(operationKey);
    if (current) return current;
    throw new Error("DEVELOPMENT_ROOM_FIXTURE_RECEIPT_INVALID");
  }

  async captureBaseline(
    surface: DevelopmentRoomFixtureSurface,
    indexKey: string,
    roomKey: (code: string) => string,
  ) {
    const indexMembers = (await redisCommand<string[]>(["SMEMBERS", indexKey]))
      .filter((code): code is string => typeof code === "string")
      .sort();
    if (indexMembers.length > developmentRoomFixtureBaselineMaximum) {
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_BASELINE_LIMIT");
    }
    const values: Array<string | null> = [];
    for (const batch of chunks(indexMembers, 64)) {
      values.push(...await loadOnlineRoomValues(batch, roomKey));
    }
    const roomDigests = Object.fromEntries(indexMembers.map((code, index) => [
      code,
      values[index] === null ? null : sha256(values[index]!),
    ]));
    return {
      surface,
      indexMembers,
      roomDigests,
      digest: sha256(JSON.stringify({ indexMembers, roomDigests })),
    };
  }

  async append(
    operationKey: string,
    inputs: DevelopmentRoomFixtureAppendInput[],
  ) {
    const results: Array<"created" | "conflict"> = [];
    for (const batch of chunks(inputs, 12)) {
      const response = await redisPipeline<number[]>(batch.map((input) => [
        "EVAL",
        appendTargetLua,
        "3",
        operationKey,
        input.roomKey,
        input.indexKey,
        input.raw,
        input.target.code,
        JSON.stringify(input.target),
        String(input.roomTtlSeconds),
        String(developmentRoomFixtureReceiptTtlSeconds),
      ]));
      for (const result of response) {
        if (result === 1) results.push("created");
        else if (result === 0) results.push("conflict");
        else throw new Error(result === -4
          ? "DEVELOPMENT_ROOM_FIXTURE_TARGET_LIMIT"
          : "DEVELOPMENT_ROOM_FIXTURE_RECEIPT_STATE_INVALID");
      }
    }
    return results;
  }

  async replaceTarget(
    operationKey: string,
    target: DevelopmentRoomFixtureTarget,
    roomKey: string,
    raw: string,
    roomTtlSeconds: number,
    nextKind: DevelopmentRoomFixtureKind,
  ) {
    const result = await redisCommand<number>([
      "EVAL",
      replaceTargetLua,
      "2",
      operationKey,
      roomKey,
      target.roomIdentity,
      target.publicIdentity,
      nextKind,
      raw,
      String(roomTtlSeconds),
      String(developmentRoomFixtureReceiptTtlSeconds),
    ]);
    if (result !== 1) throw new Error("DEVELOPMENT_ROOM_FIXTURE_TARGET_REPLACEMENT_FAILED");
  }

  async scanPage(
    indexKey: string,
    roomKey: (code: string) => string,
    cursor: string,
  ) {
    const page = await scanOnlineRoomCodes(indexKey, cursor);
    return {
      ...page,
      values: await loadOnlineRoomValues(page.codes, roomKey),
    };
  }

  indexMembers(indexKey: string) {
    return redisCommand<string[]>(["SMEMBERS", indexKey]);
  }

  roomValue(roomKey: string) {
    return redisCommand<string | null>(["GET", roomKey]);
  }

  async indexHas(indexKey: string, code: string) {
    return await redisCommand<number>(["SISMEMBER", indexKey, code]) === 1;
  }

  async cleanup(
    operationKey: string,
    inputs: Array<{
      target: DevelopmentRoomFixtureTarget;
      indexKey: string;
      roomKey: string;
    }>,
  ) {
    const results: Array<"cleaned" | "identity-mismatch"> = [];
    for (const batch of chunks(inputs, 12)) {
      const response = await redisPipeline<number[]>(batch.map((input) => [
        "EVAL",
        cleanupTargetLua,
        "3",
        operationKey,
        input.roomKey,
        input.indexKey,
        input.target.roomIdentity,
        input.target.code,
        input.target.publicIdentity,
        String(developmentRoomFixtureReceiptTtlSeconds),
      ]));
      for (const result of response) {
        if (result === 1) results.push("cleaned");
        else if (result === 0) results.push("identity-mismatch");
        else throw new Error("DEVELOPMENT_ROOM_FIXTURE_CLEANUP_STATE_INVALID");
      }
    }
    return results;
  }
}
