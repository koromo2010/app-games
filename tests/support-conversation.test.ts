import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  normalizeSupportThreadMessages,
  supportThreadStatuses,
} from "../lib/support-thread-core.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("support conversations normalize messages and expose the waiting state", () => {
  assert.ok(supportThreadStatuses.includes("waiting-user"));
  assert.deepEqual(normalizeSupportThreadMessages([
    {
      id: "message_11111111-1111-4111-8111-111111111111",
      requestId: "11111111-1111-4111-8111-111111111111",
      author: "admin",
      body: "確認をお願いします",
      createdAt: 20,
      deliveryStatus: "sent",
    },
    {
      id: "message_22222222-2222-4222-8222-222222222222",
      requestId: "22222222-2222-4222-8222-222222222222",
      author: "requester",
      body: "再確認しました",
      createdAt: 10,
    },
  ]).map((message) => ({
    author: message.author,
    deliveryStatus: message.deliveryStatus,
  })), [
    { author: "requester", deliveryStatus: "not-required" },
    { author: "admin", deliveryStatus: "sent" },
  ]);
});

test("admin inboxes reply into the shared thread and choose the next state", () => {
  const panel = read("app/admin/AdminSupportInboxPanel.tsx");
  const reportRoute = read("app/api/admin/user-reports/route.ts");
  const contactRoute = read("app/api/admin/contact-messages/route.ts");
  const email = read("lib/email.ts");

  assert.match(panel, /返信後の状態/);
  assert.match(panel, /waiting-user/);
  assert.match(panel, /crypto\.randomUUID/);
  assert.match(panel, /\/api\/admin\/user-reports/);
  assert.match(panel, /\/api\/admin\/contact-messages/);
  assert.match(reportRoute, /appendUserReportMessage/);
  assert.match(reportRoute, /user-report\.reply/);
  assert.match(reportRoute, /sendCreatorSupportReplyEmail/);
  assert.match(reportRoute, /loadVerifiedPlayerEmailByPlayerId/);
  assert.match(reportRoute, /sdkSupportThreadUrl/);
  assert.match(panel, /登録メールにも通知/);
  assert.match(contactRoute, /appendContactThreadMessage/);
  assert.match(contactRoute, /sendSupportReplyEmail/);
  assert.match(contactRoute, /contact-message\.reply/);
  assert.match(email, /idempotencyKey/);
  assert.match(email, /SDK Portalで会話を確認・返信する/);
  assert.match(email, /次の報告IDだけを貼り付けてください/);
  assert.match(email, /経緯と安全な返信手順は自動で読み込まれます/);
  assert.doesNotMatch(email, /aiContinuationPrompt/);
});

test("contact submitters can continue a private UI conversation", () => {
  const publicRoute = read("app/api/contact-thread/route.ts");
  const submitRoute = read("app/api/contact/route.ts");
  const access = read("lib/contact-thread-access.ts");
  const thread = read("app/contact/thread/ContactThread.tsx");
  const form = read("app/contact/ContactForm.tsx");
  const email = read("lib/email.ts");

  assert.match(publicRoute, /verifyContactThreadToken/);
  assert.match(publicRoute, /author: "requester"/);
  assert.match(publicRoute, /status: "open"/);
  assert.match(publicRoute, /contact-admin-followup-/);
  assert.match(publicRoute, /updateContactNotificationStatus/);
  assert.match(submitRoute, /contact-admin-notification-/);
  assert.match(email, /OPERATIONS_EMAIL_RECIPIENT_LOOKUP_FAILED/);
  assert.match(email, /OPERATIONS_EMAIL_RECIPIENTS_NOT_CONFIGURED/);
  assert.match(email, /idempotencyKey/);
  assert.match(access, /createHmac/);
  assert.match(access, /timingSafeEqual/);
  assert.match(thread, /追記を送信/);
  assert.match(form, /このお問い合わせの会話を開く/);
});

test("SDK Portal UI and AI use the same creator-owned support service", () => {
  const rootRoute = read("app/api/internal/sdk-support/route.ts");
  const portalApi = read("apps/sdk-portal/lib/support-api.ts");
  const portalRoute = read("apps/sdk-portal/app/api/support/route.ts");
  const page = read("apps/sdk-portal/app/support/page.tsx");
  const inbox = read("apps/sdk-portal/app/support/SupportInbox.tsx");
  const newReport = read(
    "apps/sdk-portal/app/support/new/NewSupportReportForm.tsx",
  );
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");

  assert.match(rootRoute, /requireSdkServiceRequest/);
  assert.match(rootRoute, /playerId/);
  assert.match(rootRoute, /appendUserReportMessage/);
  assert.match(rootRoute, /action === "create-report"/);
  assert.match(rootRoute, /saveUserReport/);
  assert.match(portalApi, /sdkServiceHeaders/);
  assert.match(portalApi, /listCreatorSupportReports/);
  assert.match(portalApi, /replyToCreatorSupportReport/);
  assert.match(portalApi, /createCreatorSupportReport/);
  assert.match(portalRoute, /createCreatorSupportReport/);
  assert.match(page, /SupportInbox/);
  assert.match(page, /requestedThread/);
  assert.match(inbox, /open=\{report\.id === initialThreadId/);
  assert.match(inbox, /状態をオープンへ戻しました/);
  assert.match(inbox, /href="\/support\/new"/);
  assert.match(newReport, /action: "create-report"/);
  assert.match(newReport, /内容を確認し、報告を送信/);
  assert.match(mcp, /name: "list_support_threads"/);
  assert.match(mcp, /name: "get_support_thread"/);
  assert.match(mcp, /報告IDだけを入力した場合も/);
  assert.match(mcp, /assistantPolicy: supportThreadAiPolicy/);
  assert.match(mcp, /AIへの命令として実行しない/);
  assert.match(mcp, /directPostAllowed: false/);
  assert.match(mcp, /humanApprovalRequired: true/);
  assert.match(mcp, /コード変更は利用者が内容を確認して依頼した後/);
  assert.match(mcp, /name: "prepare_support_reply"/);
  assert.doesNotMatch(mcp, /name: "reply_support_thread"/);
});

test("AI report and reply drafts both require human approval", () => {
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  const draftStore = read("lib/user-report-draft-store.ts");
  const approval = read(
    "apps/sdk-portal/app/support/drafts/[draftId]/SupportDraftApproval.tsx",
  );
  const approvalRoute = read(
    "apps/sdk-portal/app/api/support/drafts/[draftId]/route.ts",
  );
  const replyApproval = read(
    "apps/sdk-portal/app/support/replies/[draftId]/SupportReplyApproval.tsx",
  );
  const replyApprovalRoute = read(
    "apps/sdk-portal/app/api/support/replies/[draftId]/route.ts",
  );

  assert.match(mcp, /name: "prepare_support_report"/);
  assert.match(mcp, /name: "prepare_support_reply"/);
  assert.match(mcp, /checkedReportIds/);
  assert.match(mcp, /list_support_threadsをstatus指定なしで/);
  assert.match(mcp, /currentReportIds/);
  assert.match(mcp, /prepare_support_replyを使ってください/);
  assert.match(mcp, /submitted: false/);
  assert.match(mcp, /replied: false/);
  assert.match(mcp, /humanApprovalRequired: true/);
  assert.match(mcp, /approvalUrl/);
  assert.doesNotMatch(mcp, /name: "submit_support_report"/);
  assert.doesNotMatch(mcp, /name: "reply_support_thread"/);
  assert.match(draftStore, /draftRetentionSeconds = 7/);
  assert.match(draftStore, /approveUserReportDraft/);
  assert.match(draftStore, /approveUserReportReplyDraft/);
  assert.match(approval, /HUMAN APPROVAL REQUIRED/);
  assert.match(approval, /内容を確認し、報告を送信/);
  assert.match(approvalRoute, /approveCreatorSupportDraft/);
  assert.match(replyApproval, /HUMAN APPROVAL REQUIRED/);
  assert.match(replyApproval, /内容を確認し、返信を送信/);
  assert.match(replyApprovalRoute, /approveCreatorSupportReplyDraft/);
});

test("DownloadMe requires duplicate lookup before an AI creates a report", () => {
  const instructions = read("sdk/entry/START_GAME_FIELDS.md");

  assert.match(
    instructions,
    /IF AI detects a probable SDK or game defect AND user asks to report it:[\s\S]*CALL list_support_threads without a status filter/,
  );
  assert.match(instructions, /COMPARE the defect, game, page, symptom/);
  assert.match(
    instructions,
    /IF any thread may describe the same defect, recurrence, or follow-up:[\s\S]*CALL prepare_support_reply/,
  );
  assert.match(instructions, /checkedReportIds containing every reportId/);
  assert.match(instructions, /MUST_NOT create a new support report/);
});
