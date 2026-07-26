import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("password reset delivery failure releases only its own cooldown", () => {
  const reset = read("lib/player-password-reset.ts");

  assert.match(reset, /const attemptId = randomBytes/);
  assert.match(reset, /limitKey,\s*attemptId,\s*"NX"/);
  assert.match(
    reset,
    /if redis\.call\("GET", KEYS\[2\]\) == ARGV\[1\] then\s*redis\.call\("DEL", KEYS\[2\]\)/,
  );
});

test("failed email verification resend restores the previous valid link", () => {
  const verification = read("lib/player-email-verification.ts");
  const sendPosition = verification.indexOf(
    "await sendRecoveryEmailVerificationEmail",
  );
  const retirePreviousPosition = verification.indexOf(
    'redis.call("DEL", KEYS[3])',
  );

  assert.ok(sendPosition > 0);
  assert.ok(retirePreviousPosition > sendPosition);
  assert.match(verification, /local previousTtl = redis\.call\("TTL", KEYS\[3\]\)/);
  assert.match(
    verification,
    /redis\.call\("SET", KEYS\[2\], ARGV\[2\], "EX", previousTtl\)/,
  );
});

test("support reply email retries reuse the saved message", () => {
  const panel = read("app/admin/AdminSupportInboxPanel.tsx");
  const reportRoute = read("app/api/admin/user-reports/route.ts");
  const contactRoute = read("app/api/admin/contact-messages/route.ts");

  assert.match(panel, /返信メールだけ再送/);
  assert.match(panel, /action: "retry-email"/);
  assert.match(reportRoute, /USER_REPORT_REPLY_EMAIL_NOT_RETRYABLE/);
  assert.match(reportRoute, /body: existingMessage\.body/);
  assert.match(
    reportRoute,
    /idempotencyKey: `user-report-reply-\$\{existingMessage\.id\}`/,
  );
  assert.match(contactRoute, /CONTACT_REPLY_EMAIL_NOT_RETRYABLE/);
  assert.match(contactRoute, /body: existingMessage\.body/);
  assert.match(
    contactRoute,
    /idempotencyKey: `contact-reply-\$\{existingMessage\.id\}`/,
  );
});

test("new support submissions and follow-ups keep request IDs for retries", () => {
  const reportButton = read("app/components/UserReportButton.tsx");
  const reportRoute = read("app/api/user-reports/route.ts");
  const contactForm = read("app/contact/ContactForm.tsx");
  const contactRoute = read("app/api/contact/route.ts");
  const contactThread = read("app/contact/thread/ContactThread.tsx");
  const portalInbox = read(
    "apps/sdk-portal/app/support/SupportInbox.tsx",
  );

  assert.match(reportButton, /requestIdRef\.current \?\?= crypto\.randomUUID/);
  assert.match(reportRoute, /reportId: `report_\$\{requestId\}`/);
  assert.match(contactForm, /requestIdRef\.current \?\?= crypto\.randomUUID/);
  assert.match(contactRoute, /contactId: `contact_\$\{requestId\}`/);
  assert.match(contactThread, /requestIdRef\.current \?\?= crypto\.randomUUID/);
  assert.match(portalInbox, /replyRequestIds\.current\[report\.id\]/);
});

test("AI-approved support follow-up always notifies for a new message", () => {
  const supportRoute = read("app/api/internal/sdk-support/route.ts");

  assert.match(
    supportRoute,
    /if \(result\.inserted \|\| report\.notificationStatus !== "sent"\)/,
  );
  assert.match(
    supportRoute,
    /user-report-admin-followup-\$\{result\.message\.id\}/,
  );
});
