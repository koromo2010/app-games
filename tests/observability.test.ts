import assert from "node:assert/strict";
import test from "node:test";
import { observabilityErrorCode, observabilityRef, sanitizeObservabilityFields } from "../lib/observability/event.ts";

test("観測イベントは許可済みフィールド以外を捨てる", () => {
  const fields = sanitizeObservabilityFields({
    game: "wordwolf",
    operation: "cast-vote",
    revision: 12,
    databaseCode: "42703",
    passphrase: "secret",
    text: "投稿本文",
    cookie: "session-cookie",
    word: "正解ワード",
  });
  assert.deepEqual(fields, { game: "wordwolf", operation: "cast-vote", databaseCode: "42703", revision: 12 });
  assert.equal(JSON.stringify(fields).includes("secret"), false);
  assert.equal(JSON.stringify(fields).includes("投稿本文"), false);
});

test("storage telemetry accepts only fixed enums and numeric sizes", () => {
  assert.deepEqual(sanitizeObservabilityFields({
    workClass: "best-effort",
    storageOperation: "pipeline",
    storageTransport: "socket",
    storageCommand: "MULTIPLE",
    commandCount: 3,
    serializedBytes: 512,
    redisKey: "private-key",
    redisValue: "private-value",
    url: "https://redis.example.test",
    token: "secret-token",
  }), {
    commandCount: 3,
    serializedBytes: 512,
    workClass: "best-effort",
    storageOperation: "pipeline",
    storageTransport: "socket",
    storageCommand: "MULTIPLE",
  });
  assert.deepEqual(sanitizeObservabilityFields({
    workClass: "optional",
    storageOperation: "delete",
    storageTransport: "http",
    storageCommand: "PRIVATE_COMMAND",
  }), {});
});

test("database binding telemetry accepts only its closed safe schema", () => {
  assert.deepEqual(sanitizeObservabilityFields({
    databaseSelectorKey: "POSTGRES_PRISMA_URL",
    databaseFallbackUsed: true,
    databaseTargetFingerprint: "a".repeat(64),
    databaseNameFingerprint: "b".repeat(64),
    observedSchemaVersion: 9,
    requiredSchemaVersion: 10,
    url: "private-value",
    host: "private-value",
    query: "private-value",
  }), {
    databaseSelectorKey: "POSTGRES_PRISMA_URL",
    databaseFallbackUsed: true,
    databaseTargetFingerprint: "a".repeat(64),
    databaseNameFingerprint: "b".repeat(64),
    observedSchemaVersion: 9,
    requiredSchemaVersion: 10,
  });
  assert.deepEqual(sanitizeObservabilityFields({
    databaseSelectorKey: "UNSAFE_VARIABLE_NAME",
  }), {});
});

test("部屋とactorは安定した不透明参照へ変換する", () => {
  const first = observabilityRef("room", "ABCD");
  const second = observabilityRef("room", "ABCD");
  assert.equal(first, second);
  assert.match(first ?? "", /^room_[A-Za-z0-9_-]{16}$/);
  assert.equal(first?.includes("ABCD"), false);
  assert.notEqual(observabilityRef("actor", "ABCD"), first);
});

test("予期しない例外本文をログ用エラーコードへ流さない", () => {
  assert.equal(observabilityErrorCode(new Error("WORDWOLF_ROOM_CONFLICT")), "WORDWOLF_ROOM_CONFLICT");
  assert.equal(observabilityErrorCode(new Error("request failed with token=secret")), "UNEXPECTED_ERROR");
  assert.equal(observabilityErrorCode(new Error("NORTHERN_ACTION_INVALID:秘密の入力")), "NORTHERN_ACTION_INVALID");
});
