import assert from "node:assert/strict";
import test from "node:test";
import { unverifiedAccountIsExpired, unverifiedPlayerAccountRetentionMs } from "../lib/player-account-retention.ts";

test("メール未登録アカウントは最終利用から30日で削除対象になる", () => {
  const now = 2_000_000_000_000;
  assert.equal(unverifiedAccountIsExpired({ email: null, updatedAt: now - unverifiedPlayerAccountRetentionMs + 1 }, now), false);
  assert.equal(unverifiedAccountIsExpired({ email: null, updatedAt: now - unverifiedPlayerAccountRetentionMs }, now), true);
});

test("メール登録済みアカウントは長期間未使用でも自動削除しない", () => {
  const now = 2_000_000_000_000;
  assert.equal(unverifiedAccountIsExpired({ email: "player@example.com", updatedAt: 0 }, now), false);
});
