import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isUserReportStatus,
  normalizeStoredUserReport,
} from "../lib/user-report-core.ts";
import {
  isContactStatus,
  normalizeStoredContactMessage,
} from "../lib/contact-core.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy user reports remain readable as open reports", () => {
  const report = normalizeStoredUserReport({
    id: "report_33333333-3333-4333-8333-333333333333",
    type: "bug",
    summary: "表示されない",
    details: "再現手順",
    page: "/ja/games",
    playerId: "player-1",
    createdAt: 1234,
  });
  assert.equal(report?.status, "open");
  assert.equal(report?.updatedAt, 1234);
  assert.deepEqual(report?.messages, []);
});

test("user report status accepts only the management workflow", () => {
  assert.equal(isUserReportStatus("open"), true);
  assert.equal(isUserReportStatus("in-progress"), true);
  assert.equal(isUserReportStatus("waiting-user"), true);
  assert.equal(isUserReportStatus("resolved"), true);
  assert.equal(isUserReportStatus("deleted"), false);
});

test("admin has an authenticated report inbox and status workflow", () => {
  const panel = read("app/admin/AdminUserReportsPanel.tsx");
  const shell = read("app/admin/SiteAdminPanel.tsx");
  const route = read("app/api/admin/user-reports/route.ts");
  const store = read("lib/user-report-store.ts");

  assert.match(shell, /\['reports', '報告'\]/);
  assert.match(shell, /AdminUserReportsPanel/);
  assert.match(panel, /改善・バグ報告/);
  assert.match(panel, /ensureSiteAdminStepUp/);
  assert.match(panel, /\/api\/admin\/user-reports/);
  assert.match(route, /requireFullSiteAdminSession/);
  assert.match(route, /requireRecentSiteAdminMfa/);
  assert.match(route, /appendSiteAdminAuditLog/);
  assert.match(store, /userReportRetentionSeconds/);
  assert.match(store, /redis\.call\('DEL',prefix\.\.id\)/);
});

test("legacy contact messages remain readable and notification failures remain visible", () => {
  const contact = normalizeStoredContactMessage({
    id: "contact_44444444-4444-4444-8444-444444444444",
    category: "privacy",
    name: "",
    email: "person@example.com",
    message: "削除を希望します",
    createdAt: 5678,
  });
  assert.equal(contact?.status, "open");
  assert.equal(contact?.notificationStatus, "unknown");
  assert.deepEqual(contact?.messages, []);
  assert.equal(isContactStatus("resolved"), true);
  assert.equal(isContactStatus("waiting-user"), true);
  assert.equal(isContactStatus("deleted"), false);
});

test("admin has an authenticated contact inbox independent of notification email", () => {
  const panel = read("app/admin/AdminContactMessagesPanel.tsx");
  const shell = read("app/admin/SiteAdminPanel.tsx");
  const route = read("app/api/admin/contact-messages/route.ts");
  const publicRoute = read("app/api/contact/route.ts");
  const store = read("lib/contact-store.ts");

  assert.match(shell, /\['contacts', 'お問い合わせ'\]/);
  assert.match(shell, /AdminContactMessagesPanel/);
  assert.match(panel, /通知メールが失敗しても、ここには保存されます/);
  assert.match(route, /requireFullSiteAdminSession/);
  assert.match(route, /requireRecentSiteAdminMfa/);
  assert.match(publicRoute, /updateContactNotificationStatus/);
  assert.match(publicRoute, /"failed" as const/);
  assert.match(store, /contactRetentionSeconds/);
  assert.match(store, /redis\.call\('DEL',prefix\.\.id\)/);
});

test("account deletion covers reports, feedback, defaults, and word histories", () => {
  const deletion = read("lib/player-data-deletion.ts");
  const feedback = read("lib/game-feedback-store.ts");
  const defaults = read("lib/room-defaults-store.ts");
  const wordwolf = read("lib/wordwolf-topic-history-store.ts");

  assert.match(deletion, /deleteUserReportsForPlayer/);
  assert.match(deletion, /deleteUserReportDraftsForPlayer/);
  assert.match(deletion, /deletePlayerGameFeedbackData/);
  assert.match(deletion, /deleteStoredRoomDefaults/);
  assert.match(deletion, /deleteWordWolfTopicHistory/);
  assert.match(deletion, /deleteGeneralGameWordHistory/);
  assert.match(feedback, /SCAN/);
  assert.match(feedback, /LREM/);
  assert.match(defaults, /roomDefaultsTtlSeconds/);
  assert.match(wordwolf, /EXPIRE/);
});

test("retention deletion uses the same dependent-data cleanup before deleting accounts", () => {
  const accounts = read("lib/player-account-store.ts");
  const postgres = read("lib/player-account-postgres-store.ts");
  const deletion = read("lib/player-data-deletion.ts");

  assert.match(accounts, /listExpiredPostgresPlayerAccountIds/);
  assert.match(accounts, /await deletePlayerDependentData\(playerId\)/);
  assert.match(accounts, /playerAccountEmailKey\(account\.email\)/);
  assert.match(postgres, /SELECT player_id FROM player_accounts/);
  assert.doesNotMatch(postgres, /WITH expired AS/);
  assert.match(deletion, /deleteTahoiyaTopicHistory/);
});
