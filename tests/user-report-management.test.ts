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
  assert.equal(report?.notificationStatus, "unknown");
  assert.equal(report?.notificationErrorCode, null);
  assert.equal(report?.notificationAttemptedAt, null);
  assert.deepEqual(report?.messages, []);
});

test("user report status accepts only the management workflow", () => {
  assert.equal(isUserReportStatus("open"), true);
  assert.equal(isUserReportStatus("in-progress"), true);
  assert.equal(isUserReportStatus("waiting-user"), true);
  assert.equal(isUserReportStatus("resolved"), true);
  assert.equal(isUserReportStatus("deleted"), false);
});

test("admin has one authenticated inbox for reports and contacts", () => {
  const panel = read("app/admin/AdminSupportInboxPanel.tsx");
  const shell = read("app/admin/SiteAdminPanel.tsx");
  const reportRoute = read("app/api/admin/user-reports/route.ts");
  const contactRoute = read("app/api/admin/contact-messages/route.ts");
  const reportStore = read("lib/user-report-store.ts");

  assert.match(shell, /\['support', '問い合わせ・報告'\]/);
  assert.match(shell, /AdminSupportInboxPanel/);
  assert.doesNotMatch(shell, /\['reports', '報告'\]/);
  assert.doesNotMatch(shell, /\['contacts', 'お問い合わせ'\]/);
  assert.match(panel, /問い合わせ・報告/);
  assert.match(panel, /ensureSiteAdminStepUp/);
  const replyHandler = panel.slice(
    panel.indexOf("const sendReply"),
    panel.indexOf("\n\n  return (", panel.indexOf("const sendReply")),
  );
  assert.doesNotMatch(replyHandler, /ensureSiteAdminStepUp/);
  assert.match(replyHandler, /replyRequestIds/);
  assert.match(replyHandler, /入力内容は残っています/);
  assert.match(panel, /\/api\/admin\/user-reports/);
  assert.match(panel, /\/api\/admin\/contact-messages/);
  assert.match(panel, /setItems\(\[\]\)/);
  assert.match(panel, /古い件数は表示していません/);
  assert.match(panel, /role="alert"/);
  assert.match(panel, /報告IDで直接検索/);
  assert.match(panel, /recordFor\(right\)\.updatedAt/);
  assert.match(panel, /管理者通知を再送/);
  assert.equal(
    panel.match(/\{initialBody\(item\)\}/g)?.length,
    1,
    "the initial submission should only appear in the content section",
  );
  assert.match(panel, /record\.messages\.length > 0/);
  assert.match(panel, /返信・追記/);
  assert.match(reportRoute, /requireFullSiteAdminSession/);
  assert.match(reportRoute, /user-report\.list/);
  assert.match(reportRoute, /inspectUserReportStorage/);
  assert.match(reportRoute, /safeUserReportStorageAudit/);
  assert.match(reportRoute, /USER_REPORTS_LOAD_FAILED/);
  assert.match(reportRoute, /requireRecentSiteAdminMfa/);
  const reportReplyRoute = reportRoute.slice(
    reportRoute.indexOf("export async function POST"),
    reportRoute.indexOf("export async function PUT"),
  );
  const contactReplyRoute = contactRoute.slice(
    contactRoute.indexOf("export async function POST"),
    contactRoute.indexOf("export async function PUT"),
  );
  for (const replyRoute of [reportReplyRoute, contactReplyRoute]) {
    assert.match(replyRoute, /requireFullSiteAdminSession/);
    assert.doesNotMatch(replyRoute, /requireRecentSiteAdminMfa/);
  }
  assert.match(reportRoute, /export async function PUT/);
  assert.match(reportRoute, /user-report\.notification-retry/);
  assert.match(reportRoute, /appendSiteAdminAuditLog/);
  assert.match(contactRoute, /export async function PUT/);
  assert.match(contactRoute, /contact-message\.list/);
  assert.match(contactRoute, /CONTACT_MESSAGES_LOAD_FAILED/);
  assert.match(reportStore, /userReportRetentionSeconds/);
  assert.match(reportStore, /notificationErrorCode/);
  assert.match(reportStore, /redis\.call\('DEL',prefix\.\.id\)/);
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
  assert.equal(contact?.notificationErrorCode, null);
  assert.equal(contact?.notificationAttemptedAt, null);
  assert.deepEqual(contact?.messages, []);
  assert.equal(isContactStatus("resolved"), true);
  assert.equal(isContactStatus("waiting-user"), true);
  assert.equal(isContactStatus("deleted"), false);
});

test("admin has an authenticated contact inbox independent of notification email", () => {
  const panel = read("app/admin/AdminSupportInboxPanel.tsx");
  const route = read("app/api/admin/contact-messages/route.ts");
  const publicRoute = read("app/api/contact/route.ts");
  const store = read("lib/contact-store.ts");

  assert.match(panel, /通知メールが失敗しても、会話はここに保存されます/);
  assert.match(panel, /管理者通知を再送/);
  assert.match(panel, /notificationErrorCode/);
  assert.match(route, /requireFullSiteAdminSession/);
  assert.match(route, /requireRecentSiteAdminMfa/);
  assert.match(route, /export async function PUT/);
  assert.match(route, /contact-message\.notification-retry/);
  assert.match(route, /updateContactNotificationStatus/);
  assert.match(publicRoute, /updateContactNotificationStatus/);
  assert.match(publicRoute, /"failed" as const/);
  assert.match(publicRoute, /contact\.admin-notification/);
  assert.match(publicRoute, /observabilityErrorCode/);
  assert.match(store, /contactRetentionSeconds/);
  assert.match(store, /notificationErrorCode/);
  assert.match(store, /redis\.call\('DEL',prefix\.\.id\)/);
});

test("new reports and requester follow-ups notify the shared admin audience", () => {
  const submitRoute = read("app/api/user-reports/route.ts");
  const supportRoute = read("app/api/internal/sdk-support/route.ts");
  const delivery = read("lib/user-report-admin-notification.ts");
  const email = read("lib/email.ts");
  const accounts = read("app/admin/AdminAccountsPanel.tsx");

  assert.match(submitRoute, /user-report-admin-notification-/);
  assert.match(supportRoute, /user-report-admin-notification-/);
  assert.match(supportRoute, /user-report-admin-followup-/);
  assert.match(delivery, /sendSupportAdminNotificationEmail/);
  assert.match(email, /audience: "contacts"/);
  assert.match(delivery, /updateUserReportNotificationStatus/);
  assert.match(accounts, /問い合わせ・報告を受け取る/);
  assert.match(accounts, /問い合わせフォーム、改善要望、バグ報告と、その追記内容/);
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
