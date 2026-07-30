import assert from "node:assert/strict";
import test from "node:test";
import {
  appendContactThreadMessage,
  listContactMessages,
  saveContactMessage,
  updateContactMessageStatus,
} from "../lib/contact-store.ts";
import {
  appendUserReportMessage,
  listUserReports,
  saveUserReport,
  updateUserReportStatus,
} from "../lib/user-report-store.ts";

class InMemoryRedisRest {
  readonly strings = new Map<string, string>();
  readonly lists = new Map<string, string[]>();
  readonly atomicInsertKeys: string[][] = [];

  execute(command: unknown[]) {
    const name = String(command[0]).toUpperCase();
    if (name === "GET") {
      return this.strings.get(String(command[1])) ?? null;
    }
    if (name === "LRANGE") {
      const values = this.lists.get(String(command[1])) ?? [];
      const start = Number(command[2]);
      const requestedEnd = Number(command[3]);
      const end = requestedEnd < 0 ? values.length : requestedEnd + 1;
      return values.slice(start, end);
    }
    if (name === "MGET") {
      return command.slice(1).map(
        (key) => this.strings.get(String(key)) ?? null,
      );
    }
    if (name !== "EVAL") {
      throw new Error(`UNSUPPORTED_REDIS_COMMAND_${name}`);
    }

    const script = String(command[1]);
    const keyCount = Number(command[2]);
    const keys = command.slice(3, 3 + keyCount).map(String);
    const argv = command.slice(3 + keyCount).map(String);
    if (script.includes("redis.call('LPUSH',KEYS[2],ARGV[2])")) {
      this.atomicInsertKeys.push(keys);
      const [recordKey, indexKey] = keys;
      if (this.strings.has(recordKey)) return 0;
      this.strings.set(recordKey, argv[0]);
      const index = this.lists.get(indexKey) ?? [];
      index.unshift(argv[1]);
      this.lists.set(indexKey, index);
      return 1;
    }
    if (script.includes("redis.call('GET',KEYS[1])==ARGV[1]")) {
      const [recordKey] = keys;
      if (this.strings.get(recordKey) !== argv[0]) return 0;
      this.strings.set(recordKey, argv[1]);
      return 1;
    }
    throw new Error("UNSUPPORTED_REDIS_SCRIPT");
  }

  fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    const command = JSON.parse(String(init?.body)) as unknown[];
    return Response.json({ result: this.execute(command) });
  };
}

function useRedis(rest: InMemoryRedisRest) {
  const environmentKeys = [
    "DEV_REDIS_KV_REST_API_URL",
    "DEV_REDIS_KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "REDIS_ENV",
  ] as const;
  const originalEnvironment = new Map(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  const originalFetch = globalThis.fetch;
  for (const key of environmentKeys) delete process.env[key];
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  globalThis.fetch = rest.fetch;
  return () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

test("contact and report saves atomically enter the admin indexes", async () => {
  const redis = new InMemoryRedisRest();
  const restore = useRedis(redis);
  try {
    const contactId = "contact_11111111-1111-4111-8111-111111111111";
    const reportId = "report_22222222-2222-4222-8222-222222222222";
    await saveContactMessage({
      category: "general",
      name: "Test",
      email: "test@example.test",
      message: "Synthetic contact",
    }, { contactId });
    await saveUserReport({
      playerId: "player-test",
      type: "bug",
      summary: "Synthetic report",
      details: "",
      page: "/test",
    }, { reportId });

    assert.deepEqual(
      (await listContactMessages()).map((contact) => contact.id),
      [contactId],
    );
    assert.deepEqual(
      (await listUserReports()).map((report) => report.id),
      [reportId],
    );
    assert.deepEqual(redis.atomicInsertKeys, [
      [`contact:v1:${contactId}`, "contacts:v1"],
      [`user-report:v1:${reportId}`, "user-reports:v1"],
    ]);
  } finally {
    restore();
  }
});

test("requester follow-ups return contacts and reports to open", async () => {
  const redis = new InMemoryRedisRest();
  const restore = useRedis(redis);
  try {
    const contactId = "contact_33333333-3333-4333-8333-333333333333";
    const reportId = "report_44444444-4444-4444-8444-444444444444";
    await saveContactMessage({
      category: "bug",
      name: "",
      email: "test@example.test",
      message: "Synthetic contact",
    }, { contactId });
    await saveUserReport({
      playerId: "player-test",
      type: "request",
      summary: "Synthetic report",
      details: "",
      page: "/test",
    }, { reportId });
    await updateContactMessageStatus(contactId, "resolved");
    await updateUserReportStatus(reportId, "resolved");

    await appendContactThreadMessage({
      contactId,
      requestId: "contact-follow-up",
      author: "requester",
      body: "Follow-up",
      status: "open",
    });
    await appendUserReportMessage({
      reportId,
      playerId: "player-test",
      requestId: "report-follow-up",
      author: "requester",
      body: "Follow-up",
      status: "open",
    });

    assert.equal((await listContactMessages())[0]?.status, "open");
    assert.equal((await listUserReports())[0]?.status, "open");
  } finally {
    restore();
  }
});
