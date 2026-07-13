import assert from "node:assert/strict";
import test from "node:test";
import { observabilityErrorCode, observabilityRef, sanitizeObservabilityFields } from "../lib/observability/event.ts";

test("観測イベントは許可済みフィールド以外を捨てる", () => {
  const fields = sanitizeObservabilityFields({
    game: "wordwolf",
    operation: "cast-vote",
    revision: 12,
    passphrase: "secret",
    text: "投稿本文",
    cookie: "session-cookie",
    word: "正解ワード",
  });
  assert.deepEqual(fields, { game: "wordwolf", operation: "cast-vote", revision: 12 });
  assert.equal(JSON.stringify(fields).includes("secret"), false);
  assert.equal(JSON.stringify(fields).includes("投稿本文"), false);
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
