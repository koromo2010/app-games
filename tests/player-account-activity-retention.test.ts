import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  nextPlayerAccountActivityAt,
  playerAccountActivityTouchDue,
  playerAccountActivityTouchIntervalMs,
} from "../lib/player-account-activity.ts";
import {
  unverifiedAccountIsExpired,
  unverifiedPlayerAccountRetentionMs,
} from "../lib/player-account-retention.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("recent trusted activity protects a stale profile updatedAt from retention", () => {
  const now = 2_000_000_000_000;
  assert.equal(unverifiedAccountIsExpired({
    email: null,
    lastActivityAt: now - 1,
  }, now), false);
  assert.equal(unverifiedAccountIsExpired({
    email: null,
    lastActivityAt: now - unverifiedPlayerAccountRetentionMs,
  }, now), true);
});

test("activity touch is server-time-only, throttled, and monotonic", () => {
  const now = 2_000_000_000_000;
  const recent = now - playerAccountActivityTouchIntervalMs + 1;
  assert.equal(playerAccountActivityTouchDue(recent, now), false);
  assert.equal(playerAccountActivityTouchDue(now - playerAccountActivityTouchIntervalMs, now), true);
  assert.equal(nextPlayerAccountActivityAt(now + 10, now), now + 10);
  assert.equal(nextPlayerAccountActivityAt(null, now), now);
});

test("authenticated gameplay, room commands, and support mutations share a trusted activity touch", () => {
  const auth = read("lib/player-auth.ts");
  const rooms = read("lib/online-room-route-factory.ts");
  const sdkAdapter = read("lib/game-sdk-platform-adapter.ts");
  const publicReports = read("app/api/user-reports/route.ts");
  const contact = read("app/api/contact/route.ts");
  const sdkSupport = read("app/api/internal/sdk-support/route.ts");
  const accounts = read("lib/player-account-store.ts");

  assert.match(auth, /touchPlayerAccountActivity\(playerId\)/);
  assert.match(auth, /touchPlayerAccountActivity\(player\.id\)/);
  assert.match(rooms, /requireAuthenticatedPlayerId\(\)/);
  assert.match(rooms, /requireAuthenticatedPlayer\(\)/);
  assert.match(sdkAdapter, /requireAuthenticatedPlayer\(\)/);
  assert.match(publicReports, /requireAuthenticatedPlayer\(\)/);
  assert.match(contact, /if \(playerId\) await touchPlayerAccountActivity\(playerId\)/);
  assert.equal((sdkSupport.match(/touchPlayerAccountActivity\(playerId\)/g) ?? []).length >= 4, true);
  assert.match(accounts, /const now = Date\.now\(\);\n  const activeAccount = \{ \.\.\.account, updatedAt: now, lastActivityAt: now \}/);
});

test("retention preserves true expiry and dependent deletion while exposing only safe aggregates", () => {
  const accounts = read("lib/player-account-store.ts");
  const postgres = read("lib/player-account-postgres-store.ts");
  const cron = read("app/api/cron/account-retention/route.ts");
  const deletion = read("lib/player-data-deletion.ts");
  const schema = read("lib/postgres-schema.ts");

  assert.match(postgres, /last_activity_at IS NOT NULL AND last_activity_at <= \$\{cutoff\}/);
  assert.match(postgres, /last_activity_at IS NULL/);
  assert.match(accounts, /await deletePlayerDependentData\(playerId\)/);
  assert.match(accounts, /postgresProtectedMissingActivity/);
  assert.match(accounts, /redisProtectedMissingActivity/);
  assert.match(deletion, /deleteUserReportsForPlayer/);
  assert.match(deletion, /deleteUserReportDraftsForPlayer/);
  assert.match(schema, /last_activity_at BIGINT/);
  assert.match(schema, /Existing accounts do not have a reliable server-trusted activity/);
  assert.match(cron, /account\.retention\.protected-missing-activity/);
  assert.match(cron, /affectedCount: protectedMissingActivity/);
  assert.doesNotMatch(cron, /playerId|email|reportId|JSON\.stringify\(result\)/);
  assert.match(accounts, /storedActivity > nextActivity/);
});
