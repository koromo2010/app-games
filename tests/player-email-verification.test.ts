import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePlayerEmailVerificationPayload,
  playerAccountHasUnverifiedEmail,
  playerAccountHasVerifiedEmail,
} from "../lib/player-email-verification-policy.ts";

test("復旧用メールはメールと確認日時がそろった場合だけ確認済みになる", () => {
  assert.equal(playerAccountHasVerifiedEmail({ email: "player@example.com", emailVerifiedAt: 100 }), true);
  assert.equal(playerAccountHasVerifiedEmail({ email: "player@example.com", emailVerifiedAt: null }), false);
  assert.equal(playerAccountHasVerifiedEmail({ email: null, emailVerifiedAt: 100 }), false);
});

test("既存メールは確認日時がない間だけ再確認対象になる", () => {
  assert.equal(playerAccountHasUnverifiedEmail({ email: "player@example.com", emailVerifiedAt: null }), true);
  assert.equal(playerAccountHasUnverifiedEmail({ email: "player@example.com", emailVerifiedAt: 100 }), false);
  assert.equal(playerAccountHasUnverifiedEmail({ email: null, emailVerifiedAt: null }), false);
});

test("メール確認トークンの保存値は必要な識別子がそろった場合だけ受理する", () => {
  const payload = {
    version: 1 as const,
    playerId: "player-1",
    loginName: "player",
    email: "player@example.com",
    issuedAt: 100,
  };
  assert.deepEqual(parsePlayerEmailVerificationPayload(JSON.stringify(payload)), payload);
  assert.equal(parsePlayerEmailVerificationPayload(JSON.stringify({ ...payload, playerId: "" })), null);
  assert.equal(parsePlayerEmailVerificationPayload("not-json"), null);
});
