import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildContactReceiptEmailContent,
  buildContactReplyEmailContent,
  buildCreatorSupportReplyEmailContent,
  buildOperationsEmailContent,
  supportEmailReferenceText,
  supportEmailSubject,
  type SupportEmailContent,
  type SupportEmailReference,
} from "../lib/support-email-content.ts";

const contactId = "contact_11111111-1111-4111-8111-111111111111";
const reportId = "report_22222222-2222-4222-8222-222222222222";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function assertFullIdInEveryEmailPart(
  content: SupportEmailContent,
  reference: SupportEmailReference,
) {
  assert.ok(content.subject.includes(`[${reference.id}]`));
  assert.ok(content.text.includes(supportEmailReferenceText(reference)));
  assert.ok(content.html.includes(supportEmailReferenceText(reference)));
  assert.match(content.html, /user-select:all/);
}

test("contact and report admin notifications use the saved full ID", () => {
  const contactReference = {
    kind: "contact",
    id: contactId,
  } satisfies SupportEmailReference;
  const reportReference = {
    kind: "report",
    id: reportId,
  } satisfies SupportEmailReference;
  const contact = buildOperationsEmailContent({
    subject: supportEmailSubject(
      contactReference,
      "新しい問い合わせ",
    ),
    lines: ["種別: general"],
    supportReference: contactReference,
  });
  const report = buildOperationsEmailContent({
    subject: supportEmailSubject(reportReference, "新しいバグ報告"),
    lines: ["種別: バグ報告"],
    supportReference: reportReference,
  });

  assert.equal(
    contact.subject,
    `[Game Fields][問い合わせ][${contactId}] 新しい問い合わせ`,
  );
  assert.equal(
    report.subject,
    `[Game Fields][報告][${reportId}] 新しいバグ報告`,
  );
  assert.equal(contact.text.split("\n")[0], `受付ID：${contactId}`);
  assert.equal(report.text.split("\n")[0], `報告ID：${reportId}`);
  assertFullIdInEveryEmailPart(contact, contactReference);
  assertFullIdInEveryEmailPart(report, reportReference);
});

test("contact receipt and every reply keep the same thread ID", () => {
  const contactReference = {
    kind: "contact",
    id: contactId,
  } satisfies SupportEmailReference;
  const reportReference = {
    kind: "report",
    id: reportId,
  } satisfies SupportEmailReference;
  const receipt = buildContactReceiptEmailContent({
    contactId,
    threadUrl: "https://dev.game-fields.com/contact/thread#example",
  });
  const contactReply = buildContactReplyEmailContent({
    contactId,
    body: "確認しました。",
    threadUrl: "https://dev.game-fields.com/contact/thread#example",
  });
  const reportReply = buildCreatorSupportReplyEmailContent({
    reportId,
    body: "修正を確認してください。",
    supportUrl: `https://sdk-dev.game-fields.com/support?thread=${reportId}`,
  });

  assert.equal(
    receipt.subject,
    `[Game Fields][問い合わせ][${contactId}] お問い合わせを受け付けました`,
  );
  assert.equal(
    contactReply.subject,
    `[Game Fields][問い合わせ][${contactId}] お問い合わせへの返信`,
  );
  assert.equal(
    reportReply.subject,
    `[Game Fields][報告][${reportId}] 報告への返信`,
  );
  assertFullIdInEveryEmailPart(receipt, contactReference);
  assertFullIdInEveryEmailPart(contactReply, contactReference);
  assertFullIdInEveryEmailPart(reportReply, reportReference);
});

test("all three save paths pass the stored record ID into email delivery", () => {
  const contactRoute = read("app/api/contact/route.ts");
  const contactThreadRoute = read("app/api/contact-thread/route.ts");
  const contactAdminRoute = read(
    "app/api/admin/contact-messages/route.ts",
  );
  const reportAdminRoute = read(
    "app/api/admin/user-reports/route.ts",
  );
  const reportRoute = read("app/api/user-reports/route.ts");
  const sdkSupportRoute = read("app/api/internal/sdk-support/route.ts");
  const reportNotification = read(
    "lib/user-report-admin-notification.ts",
  );
  const email = read("lib/email.ts");
  const content = read("lib/support-email-content.ts");

  assert.match(contactRoute, /contactId: `contact_\$\{requestId\}`/);
  assert.match(
    contactRoute,
    /reference: \{\s*kind: "contact",\s*id: contact\.id,/,
  );
  assert.match(contactRoute, /contactId: contact\.id/);
  assert.match(
    contactThreadRoute,
    /reference: \{\s*kind: "contact",\s*id: contact\.id,/,
  );
  assert.match(contactAdminRoute, /contactId: existing\.id/);
  assert.match(contactAdminRoute, /contactId: result\.contact\.id/);

  assert.match(reportRoute, /reportId: `report_\$\{requestId\}`/);
  assert.match(
    reportRoute,
    /deliverUserReportAdminNotification\(stored,/,
  );
  assert.match(
    sdkSupportRoute,
    /deliverUserReportAdminNotification\(report,/,
  );
  assert.match(
    reportNotification,
    /reference: \{\s*kind: "report",\s*id: report\.id,/,
  );
  assert.match(reportAdminRoute, /reportId: existing\.id/);
  assert.match(reportAdminRoute, /reportId: result\.report\.id/);
  assert.doesNotMatch(email, /randomUUID/);
  assert.doesNotMatch(content, /randomUUID/);
});
