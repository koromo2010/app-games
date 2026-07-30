import assert from "node:assert/strict";
import test from "node:test";
import {
  copyKey,
  createPlan,
  inspectKey,
} from "../scripts/migrate-redis-namespace.mjs";

type Entry = {
  type: "string" | "hash" | "list" | "set" | "zset" | "stream";
  value: unknown;
  expiresAt: number | null;
};

class FakeRedis {
  readonly data = new Map<string, Entry>();

  constructor(entries: Record<string, Entry> = {}) {
    for (const [key, entry] of Object.entries(entries)) {
      this.data.set(key, structuredClone(entry));
    }
  }

  async sendCommand(parts: string[]) {
    const [name, key, ...args] = parts;
    const command = name.toUpperCase();
    const entry = key ? this.data.get(key) : undefined;
    switch (command) {
      case "SCAN":
        return ["0", [...this.data.keys()].sort()];
      case "TYPE":
        return entry?.type ?? "none";
      case "EXISTS":
        return entry ? 1 : 0;
      case "PTTL":
        if (!entry) return -2;
        return entry.expiresAt === null ? -1 : Math.max(0, entry.expiresAt - Date.now());
      case "GET":
        return entry?.value ?? null;
      case "HGETALL":
        return structuredClone(entry?.value ?? {});
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
      case "DEL":
        return this.data.delete(key) ? 1 : 0;
      default:
        throw new Error(`FAKE_REDIS_COMMAND_UNSUPPORTED:${command}`);
    }
  }
}

function sourceFixture() {
  const expiresAt = Date.now() + 60_000;
  return new FakeRedis({
    "app-dev:string": { type: "string", value: "value", expiresAt },
    "app-dev:hash": { type: "hash", value: { a: "1", b: "2" }, expiresAt: null },
    "app-dev:list": { type: "list", value: ["a", "b"], expiresAt: null },
    "app-dev:set": { type: "set", value: ["b", "a"], expiresAt: null },
    "app-dev:zset": { type: "zset", value: ["a", "1", "b", "2"], expiresAt: null },
    "app-dev:stream": { type: "stream", value: [["1-0", ["d", "one"]], ["2-0", ["d", "two"]]], expiresAt: null },
    "sdk:preview-instance:v1:legacy": { type: "string", value: "reservation", expiresAt },
    "sdk:production:preview-instance:v1:manual": { type: "string", value: "production", expiresAt: null },
    "unknown:key": { type: "string", value: "unknown", expiresAt: null },
  });
}

test("dry-run planは自動移行、手動判定、衝突を分類し値を含めない", async () => {
  const source = sourceFixture();
  const target = new FakeRedis({
    "app-dev:hash": { type: "hash", value: { a: "different" }, expiresAt: null },
  });
  const plan = await createPlan(source, target, "rediss://source.example:6379", "rediss://target.example:6379");
  assert.equal(plan.sourceHost, "source.example");
  assert.equal(plan.targetHost, "target.example");
  assert.equal(plan.entries.length, 9);

  const hash = plan.entries.find((entry) => entry.sourceKey === "app-dev:hash");
  assert.equal(hash?.collision, "different");
  assert.equal(hash?.action, "manual");
  const legacy = plan.entries.find((entry) => entry.sourceKey === "sdk:preview-instance:v1:legacy");
  assert.equal(legacy?.targetKey, "sdk:development:preview-instance:v1:legacy");
  assert.equal(legacy?.action, "copy");
  const production = plan.entries.find((entry) => entry.sourceKey.startsWith("sdk:production:"));
  assert.equal(production?.action, "manual");
  assert.doesNotMatch(JSON.stringify(plan), /reservation|production|unknown|different/);
});

test("copyはRedis type・digest・絶対TTLを維持しsourceを変更しない", async () => {
  const source = sourceFixture();
  const target = new FakeRedis();
  const plan = await createPlan(source, target, "rediss://source.example:6379", "rediss://target.example:6379");
  const sourceBefore = structuredClone([...source.data.entries()]);

  for (const entry of plan.entries.filter((item) => item.action === "copy")) {
    const result = await copyKey(source, target, entry);
    const sourceState = await inspectKey(source, entry.sourceKey);
    const targetState = await inspectKey(target, entry.targetKey);
    assert.equal(result.type, sourceState.type);
    assert.equal(targetState.type, sourceState.type);
    assert.equal(targetState.digest, sourceState.digest);
    if (sourceState.pttl >= 0) assert.ok(Math.abs(targetState.pttl - sourceState.pttl) < 100);
    else assert.equal(targetState.pttl, -1);
  }

  assert.deepEqual([...source.data.entries()], sourceBefore);
});

test("target衝突とplan後のsource変更でcopyを停止する", async () => {
  const source = sourceFixture();
  const target = new FakeRedis();
  const plan = await createPlan(source, target, "rediss://source.example:6379", "rediss://target.example:6379");
  const entry = plan.entries.find((item) => item.sourceKey === "app-dev:string");
  assert.ok(entry);

  target.data.set(entry.targetKey, { type: "string", value: "occupied", expiresAt: null });
  await assert.rejects(() => copyKey(source, target, entry), /REDIS_MIGRATION_TARGET_EXISTS/);
  target.data.delete(entry.targetKey);

  source.data.set(entry.sourceKey, { type: "string", value: "changed", expiresAt: null });
  await assert.rejects(() => copyKey(source, target, entry), /REDIS_MIGRATION_SOURCE_CHANGED/);
  assert.equal(target.data.has(entry.targetKey), false);
});
