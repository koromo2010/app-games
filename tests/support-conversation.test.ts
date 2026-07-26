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
  const reportPanel = read("app/admin/AdminUserReportsPanel.tsx");
  const reportRoute = read("app/api/admin/user-reports/route.ts");
  const contactPanel = read("app/admin/AdminContactMessagesPanel.tsx");
  const contactRoute = read("app/api/admin/contact-messages/route.ts");
  const email = read("lib/email.ts");

  for (const panel of [reportPanel, contactPanel]) {
    assert.match(panel, /返信後の状態/);
    assert.match(panel, /waiting-user/);
    assert.match(panel, /crypto\.randomUUID/);
  }
  assert.match(reportRoute, /appendUserReportMessage/);
  assert.match(reportRoute, /user-report\.reply/);
  assert.match(contactRoute, /appendContactThreadMessage/);
  assert.match(contactRoute, /sendSupportReplyEmail/);
  assert.match(contactRoute, /contact-message\.reply/);
  assert.match(email, /idempotencyKey/);
});

test("contact submitters can continue a private UI conversation", () => {
  const publicRoute = read("app/api/contact-thread/route.ts");
  const access = read("lib/contact-thread-access.ts");
  const thread = read("app/contact/thread/ContactThread.tsx");
  const form = read("app/contact/ContactForm.tsx");

  assert.match(publicRoute, /verifyContactThreadToken/);
  assert.match(publicRoute, /author: "requester"/);
  assert.match(publicRoute, /status: "open"/);
  assert.match(access, /createHmac/);
  assert.match(access, /timingSafeEqual/);
  assert.match(thread, /追記を送信/);
  assert.match(form, /このお問い合わせの会話を開く/);
});

test("SDK Portal UI and AI use the same creator-owned support service", () => {
  const rootRoute = read("app/api/internal/sdk-support/route.ts");
  const portalApi = read("apps/sdk-portal/lib/support-api.ts");
  const page = read("apps/sdk-portal/app/support/page.tsx");
  const inbox = read("apps/sdk-portal/app/support/SupportInbox.tsx");
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");

  assert.match(rootRoute, /requireSdkServiceRequest/);
  assert.match(rootRoute, /playerId/);
  assert.match(rootRoute, /appendUserReportMessage/);
  assert.match(portalApi, /sdkServiceHeaders/);
  assert.match(portalApi, /listCreatorSupportReports/);
  assert.match(portalApi, /replyToCreatorSupportReport/);
  assert.match(page, /SupportInbox/);
  assert.match(inbox, /状態をオープンへ戻しました/);
  assert.match(mcp, /name: "list_support_threads"/);
  assert.match(mcp, /name: "get_support_thread"/);
  assert.match(mcp, /name: "reply_support_thread"/);
});

test("AI can only prepare a report draft and human approval performs submission", () => {
  const mcp = read("apps/sdk-portal/app/api/mcp/route.ts");
  const draftStore = read("lib/user-report-draft-store.ts");
  const approval = read(
    "apps/sdk-portal/app/support/drafts/[draftId]/SupportDraftApproval.tsx",
  );
  const approvalRoute = read(
    "apps/sdk-portal/app/api/support/drafts/[draftId]/route.ts",
  );

  assert.match(mcp, /name: "prepare_support_report"/);
  assert.match(mcp, /submitted: false/);
  assert.match(mcp, /humanApprovalRequired: true/);
  assert.match(mcp, /approvalUrl/);
  assert.doesNotMatch(mcp, /name: "submit_support_report"/);
  assert.match(draftStore, /draftRetentionSeconds = 7/);
  assert.match(draftStore, /approveUserReportDraft/);
  assert.match(approval, /HUMAN APPROVAL REQUIRED/);
  assert.match(approval, /内容を確認し、報告を送信/);
  assert.match(approvalRoute, /approveCreatorSupportDraft/);
});
