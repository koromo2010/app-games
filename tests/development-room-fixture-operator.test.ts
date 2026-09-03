import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  developmentRoomFixtureEnvironmentAvailable,
  developmentRoomFixtureNamespace,
  developmentRoomFixtureTargetMaximum,
  parseDevelopmentRoomFixtureRequest,
} from "../lib/development-room-fixture-contract.ts";
import {
  DevelopmentRoomFixtureOperator,
  type DevelopmentSdkRoomFixtureTemplate,
} from "../lib/development-room-fixture-operator.ts";
import {
  type DevelopmentRoomFixtureAppendInput,
  type DevelopmentRoomFixtureBaseline,
  type DevelopmentRoomFixtureKind,
  type DevelopmentRoomFixtureOperation,
  type DevelopmentRoomFixtureStorage,
  type DevelopmentRoomFixtureSurface,
  type DevelopmentRoomFixtureTarget,
} from "../lib/development-room-fixture-storage.ts";
import { handleDevelopmentRoomFixtureRoute } from "../lib/development-room-fixture-route.ts";

const operationId = "4e5a7c28-117f-4c48-98b7-c843de4bfa71";
const playerId = "development-creator-player";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

class MemoryFixtureStorage implements DevelopmentRoomFixtureStorage {
  readonly operations = new Map<string, DevelopmentRoomFixtureOperation>();
  readonly rooms = new Map<string, string>();
  readonly indexes = new Map<string, Set<string>>();
  readonly targetKinds = new Map<string, DevelopmentRoomFixtureKind>();
  appendCount = 0;
  failAfterAppend: number | null = null;

  seed(indexKey: string, roomKey: string, code: string, raw: string) {
    this.rooms.set(roomKey, raw);
    const index = this.indexes.get(indexKey) ?? new Set<string>();
    index.add(code);
    this.indexes.set(indexKey, index);
  }

  async read(key: string) {
    const value = this.operations.get(key);
    return value ? clone(value) : null;
  }

  async begin(key: string, operation: DevelopmentRoomFixtureOperation) {
    const existing = this.operations.get(key);
    if (existing) return { created: false, operation: clone(existing) };
    this.operations.set(key, clone(operation));
    return { created: true, operation };
  }

  async replace(
    key: string,
    expectedStates: DevelopmentRoomFixtureOperation["state"][],
    operation: DevelopmentRoomFixtureOperation,
  ) {
    const current = this.operations.get(key);
    if (!current) throw new Error("DEVELOPMENT_ROOM_FIXTURE_RECEIPT_INVALID");
    if (!expectedStates.includes(current.state)) return clone(current);
    this.operations.set(key, clone(operation));
    return operation;
  }

  async captureBaseline(
    surface: DevelopmentRoomFixtureSurface,
    indexKey: string,
    roomKey: (code: string) => string,
  ) {
    const indexMembers = [...(this.indexes.get(indexKey) ?? [])].sort();
    const roomDigests = Object.fromEntries(indexMembers.map((code) => {
      const raw = this.rooms.get(roomKey(code));
      return [code, raw === undefined ? null : digest(raw)];
    }));
    return {
      surface,
      indexMembers,
      roomDigests,
      digest: digest(JSON.stringify({ indexMembers, roomDigests })),
    } satisfies DevelopmentRoomFixtureBaseline;
  }

  async append(key: string, inputs: DevelopmentRoomFixtureAppendInput[]) {
    const results: Array<"created" | "conflict"> = [];
    const operation = this.operations.get(key);
    if (!operation || operation.state !== "materializing") {
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_RECEIPT_STATE_INVALID");
    }
    for (const input of inputs) {
      if (this.failAfterAppend !== null && this.appendCount >= this.failAfterAppend) {
        throw new Error("DEVELOPMENT_ROOM_FIXTURE_INJECTED_FAILURE");
      }
      if (this.rooms.has(input.roomKey)) {
        results.push("conflict");
        continue;
      }
      this.rooms.set(input.roomKey, input.raw);
      const index = this.indexes.get(input.indexKey) ?? new Set<string>();
      index.add(input.target.code);
      this.indexes.set(input.indexKey, index);
      this.targetKinds.set(`${input.indexKey}:${input.target.code}`, input.target.kind);
      operation.targets.push(clone(input.target));
      this.appendCount += 1;
      results.push("created");
    }
    return results;
  }

  async replaceTarget(
    key: string,
    target: DevelopmentRoomFixtureTarget,
    roomKey: string,
    raw: string,
    _roomTtlSeconds: number,
    nextKind: DevelopmentRoomFixtureKind,
  ) {
    const operation = this.operations.get(key);
    if (!operation || !this.rooms.has(roomKey)) {
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_TARGET_REPLACEMENT_FAILED");
    }
    this.rooms.set(roomKey, raw);
    const stored = operation.targets.find((item) => item.publicIdentity === target.publicIdentity);
    if (!stored) throw new Error("DEVELOPMENT_ROOM_FIXTURE_TARGET_REPLACEMENT_FAILED");
    stored.kind = nextKind;
    for (const [indexKey, definition] of Object.entries(operation.surfaces)) {
      if (target.surface === indexKey) {
        this.targetKinds.set(`${definition.indexKey}:${target.code}`, nextKind);
      }
    }
  }

  async scanPage(indexKey: string, roomKey: (code: string) => string, cursor: string) {
    const offset = Number.parseInt(cursor, 10);
    const codes = [...(this.indexes.get(indexKey) ?? [])].sort((left, right) => {
      const weight = (code: string) => this.targetKinds.get(`${indexKey}:${code}`)?.startsWith("joinable-")
        ? 2
        : 0;
      return weight(left) - weight(right) || left.localeCompare(right);
    });
    const pageCodes = codes.slice(offset, offset + 24);
    const nextOffset = offset + pageCodes.length;
    return {
      codes: pageCodes,
      values: pageCodes.map((code) => this.rooms.get(roomKey(code)) ?? null),
      nextCursor: nextOffset >= codes.length ? null : String(nextOffset),
    };
  }

  async indexMembers(indexKey: string) {
    return [...(this.indexes.get(indexKey) ?? [])];
  }

  async roomValue(roomKey: string) {
    return this.rooms.get(roomKey) ?? null;
  }

  async indexHas(indexKey: string, code: string) {
    return this.indexes.get(indexKey)?.has(code) === true;
  }

  async cleanup(
    key: string,
    inputs: Array<{
      target: DevelopmentRoomFixtureTarget;
      indexKey: string;
      roomKey: string;
    }>,
  ) {
    const operation = this.operations.get(key);
    if (!operation || operation.state !== "cleaning") {
      throw new Error("DEVELOPMENT_ROOM_FIXTURE_CLEANUP_STATE_INVALID");
    }
    const results: Array<"cleaned" | "identity-mismatch"> = [];
    for (const input of inputs) {
      const raw = this.rooms.get(input.roomKey);
      if (raw) {
        const record = JSON.parse(raw) as {
          roomInstanceId?: unknown;
          creationRequestId?: unknown;
        };
        if ((record.roomInstanceId ?? record.creationRequestId) !== input.target.roomIdentity) {
          results.push("identity-mismatch");
          continue;
        }
        this.rooms.delete(input.roomKey);
      }
      this.indexes.get(input.indexKey)?.delete(input.target.code);
      this.targetKinds.delete(`${input.indexKey}:${input.target.code}`);
      const target = operation.targets.find((item) => item.publicIdentity === input.target.publicIdentity);
      if (target) target.cleaned = true;
      results.push("cleaned");
    }
    return results;
  }
}

function sdkTemplate(): DevelopmentSdkRoomFixtureTemplate {
  return {
    runtimeId: "sdk-preview:test10-1:link-lines:fixture",
    runtimeContract: {
      packageRevision: "1".repeat(40),
      packageRootSha256: "2".repeat(64),
      runtimeVersion: "fixture-runtime",
      sdkContractVersion: 1,
      roomSchemaVersion: 2,
      resourceProtocolVersion: 1,
      clientBridgeVersion: 1,
    },
    maximumPlayers: 4,
    hostPlayerId: "fixture-host",
    room: {
      code: "T185",
      revision: 1,
      phase: "lobby",
      settings: {},
      players: [{ id: "fixture-host", name: "Fixture host", seat: 0 }],
    },
  };
}

function operator(storage: MemoryFixtureStorage, templateLoads = { value: 0 }) {
  return {
    instance: new DevelopmentRoomFixtureOperator({
      storage,
      now: () => 1_800_000_000_000,
      loadSdkTemplate: async () => {
        templateLoads.value += 1;
        return sdkTemplate();
      },
    }),
    templateLoads,
  };
}

function materializeInput(id = operationId) {
  return {
    creatorSlug: "test10-1",
    playerId,
    operationId: id,
    request: new Request("https://dev.game-fields.com/api/fixture", { method: "POST" }),
  };
}

test("Development gate is exact and client input cannot select keys, payloads, or counts", () => {
  const development = {
    APP_ENV: "development",
    VERCEL_ENV: "production",
    NODE_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "develop",
    GAME_FIELDS_ENV: "development",
  } as NodeJS.ProcessEnv;
  assert.equal(developmentRoomFixtureEnvironmentAvailable(development), true);
  assert.equal(developmentRoomFixtureEnvironmentAvailable({
    ...development,
    APP_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    GAME_FIELDS_ENV: "production",
  }), false);
  assert.deepEqual(parseDevelopmentRoomFixtureRequest({ operationId }), { operationId });
  for (const forbidden of [
    { operationId, count: 25 },
    { operationId, redisKey: "hodoai:rooms" },
    { operationId, room: { code: "EVIL" } },
  ]) assert.throws(() => parseDevelopmentRoomFixtureRequest(forbidden), /REQUEST_INVALID/);
});

test("materialize verifies fixed later-page scenario and replays without duplicate generation", async () => {
  const storage = new MemoryFixtureStorage();
  const baselineRaw = JSON.stringify({ roomInstanceId: "preexisting-room-generation", phase: "playing" });
  storage.seed("hodoai:rooms", "hodoai:room:BASE", "BASE", baselineRaw);
  const setup = operator(storage);
  const first = await setup.instance.materialize(materializeInput());
  assert.equal(first.state, "ready");
  assert.equal(first.idempotentReplay, false);
  assert.ok(first.counts.builtInTargets > 24);
  assert.ok(first.counts.sdkTargets > 24);
  assert.ok(first.counts.builtInTargets + first.counts.sdkTargets <= developmentRoomFixtureTargetMaximum);
  assert.deepEqual(first.verification, {
    builtInIndexMembers: first.counts.builtInTargets + 1,
    sdkIndexMembers: first.counts.sdkTargets,
    builtInFirstStoragePageFiltered: true,
    sdkFirstStoragePageFiltered: true,
    builtInLaterJoinableJa: true,
    builtInLaterJoinableEn: true,
    sdkLaterJoinable: true,
  });
  assert.equal(new Set(first.targetIdentities).size, first.targetIdentities.length);
  assert.doesNotMatch(JSON.stringify(first), /hodoai:room:|roomIdentity|creationRequestId/);
  const appendCount = storage.appendCount;
  const replay = await setup.instance.materialize(materializeInput());
  assert.equal(replay.idempotentReplay, true);
  assert.equal(storage.appendCount, appendCount);
  assert.equal(setup.templateLoads.value, 1);

  const cleaned = await setup.instance.cleanup(materializeInput());
  assert.equal(cleaned.state, "cleaned");
  assert.equal(cleaned.counts.remainingTargets, 0);
  assert.equal(cleaned.verification?.targetCleanupConfirmed, true);
  assert.equal(cleaned.verification?.baselineUnchanged, true);
  assert.equal(storage.rooms.get("hodoai:room:BASE"), baselineRaw);
  assert.deepEqual([...storage.indexes.get("hodoai:rooms") ?? []], ["BASE"]);
  const cleanupReplay = await setup.instance.cleanup(materializeInput());
  assert.equal(cleanupReplay.state, "cleaned");
  assert.equal(cleanupReplay.idempotentReplay, true);
});

test("partial materialization preserves an exact cleanup receipt", async () => {
  const storage = new MemoryFixtureStorage();
  storage.failAfterAppend = 10;
  const setup = operator(storage);
  await assert.rejects(
    setup.instance.materialize(materializeInput("ce0c626b-65c4-4e8e-a520-e3b8a9be85d6")),
    /INJECTED_FAILURE/,
  );
  const partial = await setup.instance.status({
    creatorSlug: "test10-1",
    playerId,
    operationId: "ce0c626b-65c4-4e8e-a520-e3b8a9be85d6",
  });
  assert.equal(partial?.state, "partial");
  assert.equal(partial?.counts.remainingTargets, 10);
  const cleaned = await setup.instance.cleanup({
    creatorSlug: "test10-1",
    playerId,
    operationId: "ce0c626b-65c4-4e8e-a520-e3b8a9be85d6",
  });
  assert.equal(cleaned.state, "cleaned");
  assert.equal(cleaned.counts.remainingTargets, 0);
  assert.equal(storage.rooms.size, 0);
  assert.ok([...storage.indexes.values()].every((index) => index.size === 0));
});

test("cleanup is target-scoped and does not make unrelated baseline drift a failure", async () => {
  const storage = new MemoryFixtureStorage();
  const initial = JSON.stringify({ roomInstanceId: "preexisting-room", phase: "playing", revision: 1 });
  const changed = JSON.stringify({ roomInstanceId: "preexisting-room", phase: "playing", revision: 2 });
  storage.seed("hodoai:rooms", "hodoai:room:BASE", "BASE", initial);
  const setup = operator(storage);
  await setup.instance.materialize(materializeInput());
  storage.rooms.set("hodoai:room:BASE", changed);

  const cleaned = await setup.instance.cleanup(materializeInput());

  assert.equal(cleaned.state, "cleaned");
  assert.equal(cleaned.counts.remainingTargets, 0);
  assert.equal(cleaned.verification?.targetCleanupConfirmed, true);
  assert.equal(cleaned.verification?.baselineUnchanged, false);
  assert.equal(storage.rooms.get("hodoai:room:BASE"), changed);
  assert.deepEqual([...storage.indexes.get("hodoai:rooms") ?? []], ["BASE"]);
});

test("stored operation rejects actor and creator mismatches", async () => {
  const storage = new MemoryFixtureStorage();
  const setup = operator(storage);
  await setup.instance.materialize(materializeInput());
  await assert.rejects(
    setup.instance.status({
      creatorSlug: "test10-1",
      playerId: "another-player",
      operationId,
    }),
    /FORBIDDEN/,
  );

  const stored = [...storage.operations.values()][0]!;
  storage.operations.set(
    `development-room-fixture:v1:another-creator:${developmentRoomFixtureNamespace}:${operationId}`,
    clone(stored),
  );
  await assert.rejects(
    setup.instance.status({
      creatorSlug: "another-creator",
      playerId,
      operationId,
    }),
    /FORBIDDEN/,
  );
});

test("Production route gate returns 404 before authentication or operator access", async () => {
  const calls: string[] = [];
  const response = await handleDevelopmentRoomFixtureRoute({
    request: new Request(`https://game-fields.com/api/fixture?operationId=${operationId}`),
    creatorSlug: "test10-1",
    method: "GET",
    dependencies: {
      environmentAvailable: () => false,
      authenticate: async () => { calls.push("authenticate"); return playerId; },
      ownsCreator: async () => { calls.push("owner"); return true; },
      createOperator: () => { calls.push("operator"); throw new Error("unexpected"); },
    },
  });
  assert.equal(response.status, 404);
  assert.deepEqual(calls, []);
});

test("route requires authenticated creator ownership", async () => {
  const base = {
    request: new Request(`https://dev.game-fields.com/api/fixture?operationId=${operationId}`),
    creatorSlug: "test10-1",
    method: "GET" as const,
  };
  const unauthenticated = await handleDevelopmentRoomFixtureRoute({
    ...base,
    dependencies: {
      environmentAvailable: () => true,
      authenticate: async () => null,
      ownsCreator: async () => true,
      createOperator: () => { throw new Error("unexpected"); },
    },
  });
  assert.equal(unauthenticated.status, 401);
  const forbidden = await handleDevelopmentRoomFixtureRoute({
    ...base,
    dependencies: {
      environmentAvailable: () => true,
      authenticate: async () => playerId,
      ownsCreator: async () => false,
      createOperator: () => { throw new Error("unexpected"); },
    },
  });
  assert.equal(forbidden.status, 403);
});

test("cleanup implementation has no wildcard, KEYS, or SCAN delete path", async () => {
  const source = await readFile(
    new URL("../lib/development-room-fixture-storage.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /identity~=ARGV\[1\]/);
  assert.match(source, /SREM',KEYS\[3\],ARGV\[2\]/);
  assert.doesNotMatch(source, /redis\.call\(['"](?:KEYS|SCAN)['"]/i);
  assert.doesNotMatch(source, /DEL[^\n]*(?:\*|MATCH)/i);
});
