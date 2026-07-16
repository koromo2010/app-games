import { Resend } from "resend";
import { mergeOperationsEmailRecipients } from "@/lib/operations-email-recipients";
import { listSiteAdminNotificationEmails, type SiteAdminNotificationKind } from "@/lib/site-admin-account-store";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendPasswordResetEmail(input: {
  email: string;
  playerName: string;
  resetUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM?.trim() || "Game Fields <noreply@game-fields.com>";
  const safeName = escapeHtml(input.playerName);
  const safeUrl = escapeHtml(input.resetUrl);
  const { error } = await resend.emails.send({
    from,
    to: input.email,
    subject: "【Game Fields】パスワード再設定",
    text: `${input.playerName} さん\n\n以下のURLからパスワードを再設定してください。URLの有効期限は1時間です。\n${input.resetUrl}\n\n心当たりがない場合は、このメールを無視してください。`,
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
          <h1 style="font-size:22px;margin:0 0 20px">パスワード再設定</h1>
          <p>${safeName} さん</p>
          <p style="line-height:1.7">以下のボタンからGame Fieldsのパスワードを再設定してください。このリンクの有効期限は1時間です。</p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">パスワードを再設定</a>
          </p>
          <p style="font-size:13px;line-height:1.7;color:#475569">心当たりがない場合は、このメールを無視してください。パスワードは変更されません。</p>
        </div>
      </div>
    `,
  });

  if (error) throw new Error("EMAIL_SEND_FAILED");
}

async function operationsEmailRecipients(kind: SiteAdminNotificationKind) {
  let registered: string[] = [];
  try {
    registered = await listSiteAdminNotificationEmails(kind);
  } catch {
    // Environment-configured recipients remain available during a database outage.
  }
  return mergeOperationsEmailRecipients(process.env.OPERATIONS_ALERT_EMAIL, registered);
}

export async function sendOperationsAlertEmail(input: { subject: string; lines: string[]; audience?: SiteAdminNotificationKind; replyTo?: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const recipients = await operationsEmailRecipients(input.audience ?? "alerts");
  if (!apiKey || recipients.length === 0) throw new Error("OPERATIONS_EMAIL_NOT_CONFIGURED");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM?.trim() || "Game Fields <noreply@game-fields.com>";
  const text = input.lines.join("\n");
  const html = `<div style="font-family:sans-serif;line-height:1.7"><h1>${escapeHtml(input.subject)}</h1>${input.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>`;
  const results = await Promise.all(recipients.map((to) => resend.emails.send({
    from,
    to,
    replyTo: input.replyTo,
    subject: input.subject,
    text,
    html,
  })));
  if (results.some(({ error }) => error)) throw new Error("EMAIL_SEND_FAILED");
}
