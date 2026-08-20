import assert from "node:assert/strict";
import test from "node:test";
import {
  unverifiedAccountIsExpired,
  unverifiedPlayerAccountRetentionMs,
} from "../lib/player-account-retention.ts";

test("メール未登録アカウントは最終利用から30日で削除対象になる", () => {
  const now = 2_000_000_000_000;
  assert.equal(unverifiedAccountIsExpired({ email: null, lastActivityAt: now - unverifiedPlayerAccountRetentionMs + 1 }, now), false);
  assert.equal(unverifiedAccountIsExpired({ email: null, lastActivityAt: now - unverifiedPlayerAccountRetentionMs }, now), true);
});

test("メール登録済みアカウントは長期間未使用でも自動削除しない", () => {
  const now = 2_000_000_000_000;
  assert.equal(unverifiedAccountIsExpired({ email: "player@example.com", lastActivityAt: 0 }, now), false);
});

test("activity clockを持たない既存アカウントは保守的に自動削除しない", () => {
  const now = 2_000_000_000_000;
  assert.equal(unverifiedAccountIsExpired({ email: null, lastActivityAt: null }, now), false);
  assert.equal(unverifiedAccountIsExpired({ email: null }, now), false);
});
