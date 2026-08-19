import assert from "node:assert/strict";
import test from "node:test";
import {
  appendUserReportMessage,
  updateUserReportNotificationStatus,
  updateUserReportStatus,
} from "../lib/user-report-store.ts";
import {
  auditUserReportStorage,
  crossEnvironmentDuplicateUserReportIds,
  inspectUserReportStorage,
  userReportIndexKey,
  userReportKeyPrefix,
  userReportMaximumCount,
  userReportRetentionSeconds,
} from "../lib/user-report-storage-audit.ts";
import { createUserReportRepairDryRun } from "../lib/user-report-repair-plan.ts";

function reportId(value: number) {
  return `report_${value.toString(16).padStart(8, "0")}-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}

function storedReport(
  id: string,
  options: {
    createdAt?: number;
    updatedAt?: number;
    messages?: Array<Record<string, unknown>>;
  } = {},
) {
  const createdAt = options.createdAt ?? 100;
  return JSON.stringify({
    id,
    type: "request",
    summary: `summary-${id}`,
    details: "details",
    page: "/test",
    playerId: "player-test",
    status: "open",
    notificationStatus: "pending",
    notificationErrorCode: null,
    notificationAttemptedAt: null,
    messages: options.messages ?? [],
    createdAt,
    updatedAt: options.updatedAt ?? createdAt,
  });
}

class FixtureRedis {
  readonly strings = new Map<string, string>();
  readonly lists = new Map<string, string[]>();
  readonly ttls = new Map<string, number>();
  readonly commands: unknown[][] = [];

  execute(command: unknown[]) {
    this.commands.push(command);
    const name = String(command[0]).toUpperCase();
    if (name === "GET") {
      return this.strings.get(String(command[1])) ?? null;
    }
    if (name === "MGET") {
      return command.slice(1).map(
        (key) => this.strings.get(String(key)) ?? null,
      );
    }
    if (name === "TTL") {
      const key = String(command[1]);
      return this.strings.has(key)
        ? this.ttls.get(key) ?? userReportRetentionSeconds
        : -2;
    }
    if (name === "LRANGE") {
      const values = this.lists.get(String(command[1])) ?? [];
      const start = Number(command[2]);
      const requestedEnd = Number(command[3]);
      const end = requestedEnd < 0 ? values.length : requestedEnd + 1;
      return values.slice(start, end);
    }
    if (name === "SCAN") {
      const pattern = String(command[3] ?? "*");
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
      return ["0", [...this.strings.keys()].filter((key) => (
        pattern === "*" || key.startsWith(prefix)
      )).sort()];
    }
    if (name === "EVAL") {
      const script = String(command[1]);
      const keyCount = Number(command[2]);
      const keys = command.slice(3, 3 + keyCount).map(String);
      const argv = command.slice(3 + keyCount).map(String);
      if (script.includes("redis.call('GET',KEYS[1])==ARGV[1]")) {
        const [bodyKey, indexKey] = keys;
        if (this.strings.get(bodyKey) !== argv[0]) return 0;
        this.strings.set(bodyKey, argv[1]);
        this.ttls.set(bodyKey, Number(argv[2]));
        const index = (this.lists.get(indexKey) ?? []).filter(
          (id) => id !== argv[3],
        );
        index.unshift(argv[3]);
        this.lists.set(indexKey, index.slice(0, Number(argv[5]) + 1));
        return 1;
      }
      throw new Error("UNSUPPORTED_REDIS_SCRIPT");
    }
    throw new Error(`UNSUPPORTED_REDIS_COMMAND_${name}`);
  }

  command = async <T>(command: unknown[]) => this.execute(command) as T;

  pipeline = async <T extends unknown[]>(commands: unknown[][]) => (
    commands.map((command) => this.execute(command)) as T
  );

  fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as unknown[];
    if (String(input).endsWith("/pipeline")) {
      return Response.json((payload as unknown[][]).map((command) => ({
        result: this.execute(command),
      })));
    }
    return Response.json({ result: this.execute(payload) });
  };
}

function putBody(redis: FixtureRedis, id: string, raw = storedReport(id)) {
  redis.strings.set(`${userReportKeyPrefix}${id}`, raw);
  redis.ttls.set(`${userReportKeyPrefix}${id}`, userReportRetentionSeconds);
}

function useRedis(redis: FixtureRedis) {
  const keys = [
    "DEV_REDIS_KV_REST_API_URL",
    "DEV_REDIS_KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "REDIS_ENV",
  ] as const;
  const original = new Map(keys.map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  for (const key of keys) delete process.env[key];
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = redis.fetch;
  return () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

const reader = (redis: FixtureRedis) => ({
  command: redis.command,
  pipeline: redis.pipeline,
});

test("normal report body and index are classified as healthy", async () => {
  const redis = new FixtureRedis();
  const id = reportId(1);
  putBody(redis, id);
  redis.lists.set(userReportIndexKey, [id]);
  const audit = await auditUserReportStorage({ reader: reader(redis) });
  assert.deepEqual(audit.records[0]?.classifications, ["BODY_AND_INDEX_OK"]);
  assert.equal(audit.complete, true);
});

test("out-of-contract body TTL is anomalous and never also healthy", async () => {
  const redis = new FixtureRedis();
  const id = reportId(41);
  putBody(redis, id);
  redis.ttls.set(`${userReportKeyPrefix}${id}`, -1);
  redis.lists.set(userReportIndexKey, [id]);
  const audit = await auditUserReportStorage({ reader: reader(redis) });
  assert.deepEqual(audit.records[0]?.classifications, ["BODY_TTL_ANOMALY"]);
});

test("invalid body keys make the bounded inventory explicitly incomplete", async () => {
  const redis = new FixtureRedis();
  redis.strings.set(`${userReportKeyPrefix}not-a-report-id`, "{}");
  const audit = await auditUserReportStorage({ reader: reader(redis) });
  assert.equal(audit.complete, false);
  assert.equal(audit.invalidBodyKeyCount, 1);
  assert.deepEqual(audit.warnings, [{ code: "BODY_KEY_INVALID", count: 1 }]);
});

test("orphan body remains visible and receives a deterministic index repair plan", async () => {
  const redis = new FixtureRedis();
  const id = reportId(2);
  putBody(redis, id);
  const audit = await auditUserReportStorage({ reader: reader(redis) });
  assert.equal(audit.reports[0]?.id, id);
  assert.ok(audit.records[0]?.classifications.includes(
    "BODY_PRESENT_INDEX_MISSING",
  ));
  const plan = createUserReportRepairDryRun("production", audit);
  assert.deepEqual(plan.actions[0], {
    kind: "REBUILD_INDEX",
    currentIds: [],
    desiredIds: [id],
  });
  assert.equal(plan.writesPerformed, 0);
  assert.equal(plan.applySupported, false);
});

test("stale index entry is classified without inventing a body", async () => {
  const redis = new FixtureRedis();
  const id = reportId(3);
  redis.lists.set(userReportIndexKey, [id]);
  const audit = await auditUserReportStorage({ reader: reader(redis) });
  assert.equal(audit.records[0]?.bodyPresent, false);
  assert.ok(audit.records[0]?.classifications.includes(
    "INDEX_PRESENT_BODY_MISSING",
  ));
});

test("duplicate index entries are independently classified", async () => {
  const redis = new FixtureRedis();
  const id = reportId(4);
  putBody(redis, id);
  redis.lists.set(userReportIndexKey, [id, id]);
  const audit = await auditUserReportStorage({ reader: reader(redis) });
  assert.deepEqual(audit.records[0]?.indexPositions, [0, 1]);
  assert.ok(audit.records[0]?.classifications.includes("INDEX_DUPLICATE"));
});

test("malformed body is reported and never returned as a report", async () => {
  const redis = new FixtureRedis();
  const id = reportId(5);
  putBody(redis, id, "{");
  redis.lists.set(userReportIndexKey, [id]);
  const audit = await auditUserReportStorage({ reader: reader(redis) });
  assert.equal(audit.reports.length, 0);
  assert.ok(audit.records[0]?.classifications.includes("BODY_MALFORMED"));
});

for (const scenario of [
  {
    name: "requester follow-up",
    mutate: (id: string) => appendUserReportMessage({
      reportId: id,
      playerId: "player-test",
      requestId: "requester-follow-up",
      author: "requester",
      body: "requester follow-up",
      status: "open",
    }),
  },
  {
    name: "admin follow-up",
    mutate: (id: string) => appendUserReportMessage({
      reportId: id,
      requestId: "admin-follow-up",
      author: "admin",
      body: "admin follow-up",
      status: "waiting-user",
    }),
  },
  {
    name: "status update",
    mutate: (id: string) => updateUserReportStatus(id, "in-progress"),
  },
  {
    name: "notification update",
    mutate: (id: string) => updateUserReportNotificationStatus(
      id,
      "failed",
      "EMAIL_SEND_FAILED",
    ),
  },
]) {
  test(`${scenario.name} atomically restores an orphan body to the index`, async () => {
    const redis = new FixtureRedis();
    const id = reportId(10 + scenario.name.length);
    putBody(redis, id);
    const restore = useRedis(redis);
    try {
      await scenario.mutate(id);
      assert.deepEqual(redis.lists.get(userReportIndexKey), [id]);
      assert.equal(
        redis.commands.some((command) => (
          command[0] === "EVAL" && command[4] === userReportIndexKey
        )),
        true,
      );
    } finally {
      restore();
    }
  });
}

test("same report id in production and development is classified cross-environment", async () => {
  const id = reportId(20);
  const productionRedis = new FixtureRedis();
  const developmentRedis = new FixtureRedis();
  putBody(productionRedis, id);
  putBody(developmentRedis, id);
  const [production, development] = await Promise.all([
    auditUserReportStorage({ reader: reader(productionRedis) }),
    auditUserReportStorage({ reader: reader(developmentRedis) }),
  ]);
  assert.deepEqual(
    crossEnvironmentDuplicateUserReportIds(production, development),
    [id],
  );
});

test("exact report-id inspection reads only the target body, TTL, and bounded index", async () => {
  const redis = new FixtureRedis();
  const id = reportId(42);
  putBody(redis, id);
  redis.lists.set(userReportIndexKey, [id]);
  const inspection = await inspectUserReportStorage(id, {
    reader: reader(redis),
  });
  assert.equal(inspection.report?.id, id);
  assert.deepEqual(inspection.record.classifications, ["BODY_AND_INDEX_OK"]);
  assert.deepEqual(
    redis.commands.map((command) => String(command[0])),
    ["GET", "TTL", "LRANGE"],
  );
});

test("updatedAt, then createdAt, then report id determines list order", async () => {
  const redis = new FixtureRedis();
  const oldCreatedRecentlyUpdated = reportId(21);
  const newCreatedOlderUpdate = reportId(22);
  putBody(redis, oldCreatedRecentlyUpdated, storedReport(
    oldCreatedRecentlyUpdated,
    { createdAt: 1, updatedAt: 30 },
  ));
  putBody(redis, newCreatedOlderUpdate, storedReport(
    newCreatedOlderUpdate,
    { createdAt: 20, updatedAt: 20 },
  ));
  redis.lists.set(userReportIndexKey, [
    newCreatedOlderUpdate,
    oldCreatedRecentlyUpdated,
  ]);
  const audit = await auditUserReportStorage({ reader: reader(redis) });
  assert.deepEqual(audit.reports.map((report) => report.id), [
    oldCreatedRecentlyUpdated,
    newCreatedOlderUpdate,
  ]);
});

test("inventory and mutation paths remain bounded at the 1,000 report limit", async () => {
  const redis = new FixtureRedis();
  for (let value = 100; value < 103; value += 1) {
    putBody(redis, reportId(value));
  }
  const bounded = await auditUserReportStorage({
    reader: reader(redis),
    maximumReports: 2,
  });
  assert.equal(bounded.records.length, 2);
  assert.equal(bounded.inventoryLimitReached, true);

  const id = reportId(30);
  putBody(redis, id);
  redis.lists.set(userReportIndexKey, Array.from(
    { length: userReportMaximumCount },
    (_, index) => reportId(10_000 + index),
  ));
  const restore = useRedis(redis);
  try {
    await updateUserReportStatus(id, "in-progress");
    assert.equal(redis.lists.get(userReportIndexKey)?.length, 1_000);
    assert.equal(redis.lists.get(userReportIndexKey)?.[0], id);
  } finally {
    restore();
  }
});

test("audit and dry-run paths contain read commands only", async () => {
  const redis = new FixtureRedis();
  putBody(redis, reportId(40));
  await auditUserReportStorage({ reader: reader(redis) });
  assert.deepEqual(
    [...new Set(redis.commands.map((command) => String(command[0])))].sort(),
    ["LRANGE", "MGET", "SCAN", "TTL"],
  );
});
