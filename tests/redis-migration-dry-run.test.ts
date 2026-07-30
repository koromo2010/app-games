import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPlan,
  createPlan,
  inspectKey,
  preflightCopyPlan,
} from "../scripts/migrate-redis-namespace.mjs";

type Entry = {
  type: "string" | "hash" | "list" | "set" | "zset" | "stream";
  value: unknown;
  expiresAt: number | null;
};

class FakeRedis {
  readonly data = new Map<string, Entry>();
  failOnWriteKey: string | null = null;

  constructor(entries: Record<string, Entry> = {}) {
    for (const [key, entry] of Object.entries(entries)) this.data.set(key, structuredClone(entry));
  }

  async sendCommand(parts: string[]) {
    const [name, key, ...args] = parts;
    const command = name.toUpperCase();
    const entry = key ? this.data.get(key) : undefined;
    const writeCommands = new Set(["SET", "HSET", "RPUSH", "SADD", "ZADD", "XADD"]);
    if (writeCommands.has(command) && key === this.failOnWriteKey) {
      throw new Error(`FAKE_REDIS_WRITE_FAILED:${key}`);
    }
    switch (command) {
      case "SCAN": return ["0", [...this.data.keys()].sort()];
      case "TYPE": return entry?.type ?? "none";
      case "EXISTS": return entry ? 1 : 0;
      case "PTTL":
        if (!entry) return -2;
        return entry.expiresAt === null ? -1 : Math.max(0, entry.expiresAt - Date.now());
      case "GET": return entry?.value ?? null;
      case "HGETALL": return structuredClone(entry?.value ?? {});
      case "LRANGE":
      case "SMEMBERS":
      case "ZRANGE":
      case "XRANGE":
        return structuredClone(entry?.value ?? []);
      case "SET":
        this.data.set(key, { type: "string", value: args[0], expiresAt: null });
        return "OK";
      case "HSET": {
        const value: Record<string, string> = {};
        for (let index = 0; index + 1 < args.length; index += 2) value[args[index]] = args[index + 1];
        this.data.set(key, { type: "hash", value, expiresAt: null });
        return Object.keys(value).length;
      }
      case "RPUSH":
        this.data.set(key, { type: "list", value: [...args], expiresAt: null });
        return args.length;
      case "SADD":
        this.data.set(key, { type: "set", value: [...new Set(args)], expiresAt: null });
        return args.length;
      case "ZADD": {
        const value: string[] = [];
        for (let index = 0; index + 1 < args.length; index += 2) value.push(args[index + 1], args[index]);
        this.data.set(key, { type: "zset", value, expiresAt: null });
        return value.length / 2;
      }
      case "XADD": {
        const current = this.data.get(key);
        const rows = current?.type === "stream" ? structuredClone(current.value as unknown[]) : [];
        rows.push([args[0], args.slice(1)]);
        this.data.set(key, { type: "stream", value: rows, expiresAt: null });
        return args[0];
      }
      case "PEXPIREAT":
        if (!entry) return 0;
        entry.expiresAt = Number(args[0]);
        return 1;
      case "DEL": return this.data.delete(key) ? 1 : 0;
      default: throw new Error(`FAKE_REDIS_COMMAND_UNSUPPORTED:${command}`);
    }
  }
}

const secretMarkers = [
  "VALUE_SHOULD_NOT_APPEAR_A",
  "VALUE_SHOULD_NOT_APPEAR_B",
  "VALUE_SHOULD_NOT_APPEAR_C",
  "VALUE_SHOULD_NOT_APPEAR_D",
];

function sharedDevelopmentFixture() {
  const expiresAt = Date.now() + 60_000;
  return new FakeRedis({
    "app-dev:string": { type: "string", value: "value", expiresAt },
    "app-dev:hash": { type: "hash", value: { a: "1", b: "2" }, expiresAt: null },
    "app-dev:list": { type: "list", value: ["a", "b"], expiresAt: null },
    "app-dev:set": { type: "set", value: ["b", "a"], expiresAt: null },
    "app-dev:zset": { type: "zset", value: ["a", "1", "b", "2"], expiresAt: null },
    "app-dev:stream": { type: "stream", value: [["1-0", ["d", "one"]], ["2-0", ["d", "two"]]], expiresAt: null },
    "sdk:development:preview-instance:v1:current": { type: "string", value: "current", expiresAt },
    "preview-dev:metric:current": { type: "string", value: "metric", expiresAt: null },
    "sdk:preview-instance:v1:legacy": { type: "string", value: secretMarkers[0], expiresAt },
    "game-sdk-runtime:v2:development:game:room:ABCD": { type: "string", value: secretMarkers[1], expiresAt },
    "online-room:events:v1": { type: "stream", value: [["1-0", ["d", secretMarkers[2]]]], expiresAt: null },
    "sdk:production:preview-instance:v1:manual": { type: "string", value: "production", expiresAt: null },
    "unknown:key": { type: "string", value: secretMarkers[3], expiresAt: null },
  });
}

async function copyEntry(source: FakeRedis, sourceKey: string, targetKey: string) {
  return {
    sourceKey,
    targetKey,
    action: "copy",
    sourceState: await inspectKey(source, sourceKey),
  };
}

test("同一DB dry-runはkeep・copy・manualを分類しvalueを含めない", async () => {
  const database = sharedDevelopmentFixture();
  const endpoint = "rediss://same.example:6379";
  const plan = await createPlan(database, database, endpoint, endpoint);
  assert.equal(plan.sourceHost, "same.example");
  assert.equal(plan.targetHost, "same.example");
  assert.equal(plan.sameEndpointHost, true);
  assert.equal(plan.entries.length, 13);

  assert.equal(plan.entries.find((entry) => entry.sourceKey === "app-dev:hash")?.action, "keep");
  assert.equal(plan.entries.find((entry) => entry.sourceKey === "preview-dev:metric:current")?.action, "keep");
  const legacy = plan.entries.find((entry) => entry.sourceKey === "sdk:preview-instance:v1:legacy");
  assert.equal(legacy?.targetKey, "sdk:development:preview-instance:v1:legacy");
  assert.equal(legacy?.action, "copy");
  assert.equal(plan.entries.find((entry) => entry.sourceKey === "online-room:events:v1")?.action, "manual");
  assert.equal(plan.entries.find((entry) => entry.sourceKey.startsWith("sdk:production:"))?.action, "manual");
  for (const marker of secretMarkers) assert.doesNotMatch(JSON.stringify(plan), new RegExp(marker));
});

test("同一DB applyは旧keyを残しnamespace付きtargetを追加する", async () => {
  const database = sharedDevelopmentFixture();
  const endpoint = "rediss://same.example:6379";
  const plan = await createPlan(database, database, endpoint, endpoint);
  const sourceKeys = plan.entries.filter((entry) => entry.action === "copy").map((entry) => entry.sourceKey);
  const copied = await applyPlan(database, database, plan);
  assert.equal(copied.length, 2);
  for (const sourceKey of sourceKeys) assert.equal(database.data.has(sourceKey), true);
  assert.equal(database.data.has("sdk:development:preview-instance:v1:legacy"), true);
  assert.equal(database.data.has("app-dev:game-sdk-runtime:v2:development:game:room:ABCD"), true);
});

test("copyは全Redis type・digest・絶対TTLを維持する", async () => {
  const expiresAt = Date.now() + 120_000;
  const database = new FakeRedis({
    "source:string": { type: "string", value: "one", expiresAt },
    "source:hash": { type: "hash", value: { a: "1", b: "2" }, expiresAt: null },
    "source:list": { type: "list", value: ["a", "b"], expiresAt: null },
    "source:set": { type: "set", value: ["b", "a"], expiresAt: null },
    "source:zset": { type: "zset", value: ["a", "1", "b", "2"], expiresAt: null },
    "source:stream": { type: "stream", value: [["1-0", ["d", "one"]], ["2-0", ["d", "two"]]], expiresAt: null },
  });
  const entries = [];
  for (const type of ["string", "hash", "list", "set", "zset", "stream"]) {
    entries.push(await copyEntry(database, `source:${type}`, `target:${type}`));
  }
  const copied = await applyPlan(database, database, { entries });
  assert.equal(copied.length, 6);
  for (const type of ["string", "hash", "list", "set", "zset", "stream"]) {
    const sourceState = await inspectKey(database, `source:${type}`);
    const targetState = await inspectKey(database, `target:${type}`);
    assert.equal(targetState.type, sourceState.type);
    assert.equal(targetState.digest, sourceState.digest);
    if (sourceState.expiresAt === null) assert.equal(targetState.expiresAt, null);
    else assert.ok(Math.abs((targetState.expiresAt ?? 0) - sourceState.expiresAt) < 100);
  }
});

test("全件preflightはtarget衝突・重複target・同一key・source変更をwrite前に停止する", async () => {
  const database = new FakeRedis({
    "source:one": { type: "string", value: "one", expiresAt: null },
    "source:two": { type: "string", value: "two", expiresAt: null },
    "target:occupied": { type: "string", value: "occupied", expiresAt: null },
  });
  const first = await copyEntry(database, "source:one", "target:one");
  const collision = await copyEntry(database, "source:two", "target:occupied");
  await assert.rejects(() => applyPlan(database, database, { entries: [first, collision] }), /REDIS_MIGRATION_TARGET_EXISTS/);
  assert.equal(database.data.has("target:one"), false);

  const duplicate = await copyEntry(database, "source:two", "target:one");
  await assert.rejects(() => preflightCopyPlan(database, database, { entries: [first, duplicate] }), /REDIS_MIGRATION_DUPLICATE_TARGET/);
  await assert.rejects(
    () => preflightCopyPlan(database, database, { entries: [{ ...first, targetKey: "source:one" }] }),
    /REDIS_MIGRATION_SAME_KEY_FORBIDDEN/,
  );

  database.data.set("source:one", { type: "string", value: "changed", expiresAt: null });
  await assert.rejects(() => preflightCopyPlan(database, database, { entries: [first] }), /REDIS_MIGRATION_SOURCE_CHANGED/);
  assert.equal(database.data.has("target:one"), false);
});

test("途中失敗時はその実行で作成したtargetだけをrollbackする", async () => {
  const database = new FakeRedis({
    "source:first": { type: "string", value: "first", expiresAt: null },
    "source:second": { type: "string", value: "second", expiresAt: null },
    "unrelated:existing": { type: "string", value: "keep", expiresAt: null },
  });
  const first = await copyEntry(database, "source:first", "target:first");
  const second = await copyEntry(database, "source:second", "target:second");
  database.failOnWriteKey = "target:second";
  await assert.rejects(() => applyPlan(database, database, { entries: [first, second] }), /FAKE_REDIS_WRITE_FAILED/);
  assert.equal(database.data.has("target:first"), false);
  assert.equal(database.data.has("target:second"), false);
  assert.equal(database.data.has("source:first"), true);
  assert.equal(database.data.has("source:second"), true);
  assert.equal(database.data.has("unrelated:existing"), true);
});
