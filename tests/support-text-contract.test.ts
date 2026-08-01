import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SUPPORT_TEXT_LIMITS,
  SupportTextValidationError,
  supportTextValidationPayload,
  validateSupportReportText,
  validateSupportText,
} from "../config/support-text-contract.ts";
import { normalizeStoredUserReport } from "../lib/user-report-core.ts";
import { buildOperationsEmailContent } from "../lib/support-email-content.ts";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function exactLength(length: number, suffix: string) {
  assert.ok(suffix.length <= length);
  return `${"本".repeat(length - suffix.length)}${suffix}`;
}

const legacyCutoffFixture = exactLength(1_200, "同一revisi");
const completeIncidentFixture = `${legacyCutoffFixture}onの後続本文と計測結果`;

test("the observed 1,200-character cutoff fixture remains reproducible", () => {
  assert.equal(legacyCutoffFixture.length, 1_200);
  assert.equal(legacyCutoffFixture.endsWith("同一revisi"), true);
  assert.equal(completeIncidentFixture.length > 1_200, true);
  assert.equal(completeIncidentFixture.startsWith(legacyCutoffFixture), true);
});

test("report validation preserves the incident body and the 12,000 boundary", () => {
  const incident = validateSupportReportText({
    summary: "Preview Commandの調査",
    details: completeIncidentFixture,
    page: "/sdk-preview/example",
  });
  assert.equal(incident.details, completeIncidentFixture);

  const boundary = exactLength(SUPPORT_TEXT_LIMITS.details, "全文末尾");
  assert.equal(validateSupportText(boundary, "details"), boundary);
  assert.throws(
    () => validateSupportText(`${boundary}超`, "details"),
    (error: unknown) => {
      assert.ok(error instanceof SupportTextValidationError);
      assert.deepEqual(supportTextValidationPayload(error), {
        error: "support_text_too_long",
        field: "details",
        limit: SUPPORT_TEXT_LIMITS.details,
        length: SUPPORT_TEXT_LIMITS.details + 1,
      });
      return true;
    },
  );
});

test("summary, page, and reply limits reject instead of truncating", () => {
  for (const [field, limit] of [
    ["summary", SUPPORT_TEXT_LIMITS.summary],
    ["page", SUPPORT_TEXT_LIMITS.page],
    ["reply", SUPPORT_TEXT_LIMITS.reply],
  ] as const) {
    const boundary = "x".repeat(limit);
    assert.equal(validateSupportText(boundary, field), boundary);
    assert.throws(
      () => validateSupportText(`${boundary}x`, field),
      (error: unknown) => error instanceof SupportTextValidationError
        && error.field === field
        && error.length === limit + 1,
    );
  }
});

test("legacy stored reports stay unchanged and are never inferred or backfilled", () => {
  const report = normalizeStoredUserReport({
    id: "report_77777777-7777-4777-8777-777777777777",
    type: "bug",
    summary: "切断済みの既存報告",
    details: legacyCutoffFixture,
    page: "/sdk-preview/example",
    playerId: "player-test",
    createdAt: 1,
  });
  assert.equal(report?.details, legacyCutoffFixture);
  assert.notEqual(report?.details, completeIncidentFixture);
});

test("admin notification email contains the full details tail", () => {
  const details = exactLength(SUPPORT_TEXT_LIMITS.details, "通知メール末尾");
  const content = buildOperationsEmailContent({
    subject: "新しいバグ報告",
    lines: [details],
  });
  assert.equal(content.text.endsWith("通知メール末尾"), true);
  assert.equal(content.text.includes(details), true);
  assert.equal(content.html.includes(details), true);
});

test("every report entry point uses the shared validation contract", () => {
  const sharedLimitConsumers = [
    "app/components/UserReportButton.tsx",
    "lib/user-report-form-draft.ts",
    "app/api/user-reports/route.ts",
    "lib/user-report-store.ts",
    "apps/sdk-portal/app/support/new/NewSupportReportForm.tsx",
    "apps/sdk-portal/app/api/support/route.ts",
    "apps/sdk-portal/app/api/mcp/route.ts",
    "apps/sdk-portal/app/support/drafts/[draftId]/SupportDraftApproval.tsx",
    "apps/sdk-portal/app/api/support/drafts/[draftId]/route.ts",
    "app/api/internal/sdk-support/route.ts",
    "app/admin/AdminSupportInboxPanel.tsx",
    "apps/sdk-portal/app/support/SupportInbox.tsx",
  ];
  for (const path of sharedLimitConsumers) {
    assert.match(
      read(path),
      /support-text-contract/,
      `${path} must use the shared support text contract`,
    );
  }

  const supportPaths = [
    ...sharedLimitConsumers,
    "lib/user-report-draft-store.ts",
    "app/api/admin/user-reports/route.ts",
    "apps/sdk-portal/app/api/support/replies/[draftId]/route.ts",
  ];
  for (const path of supportPaths) {
    assert.doesNotMatch(
      read(path),
      /\.slice\(0,\s*(?:120|200|1_?200|3_?000|12_?000)\b/,
      `${path} must reject oversized support text instead of slicing it`,
    );
  }
});

test("admin and Portal conversation views render the full stored body", () => {
  const admin = read("app/admin/AdminSupportInboxPanel.tsx");
  const portal = read("apps/sdk-portal/app/support/SupportInbox.tsx");
  assert.match(admin, /return item\.report\.details \|\| item\.report\.summary/);
  assert.match(admin, /\{initialBody\(item\)\}/);
  assert.match(portal, /\{report\.details \|\| report\.summary\}/);
  assert.doesNotMatch(portal, /report\.details\.slice/);
});
