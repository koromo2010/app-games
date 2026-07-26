import { Resend } from "resend";
import { emailDeliveryError } from "@/lib/email-delivery-error";
import { mergeOperationsEmailRecipients } from "@/lib/operations-email-recipients";
import { listSiteAdminNotificationEmails, type SiteAdminNotificationKind } from "@/lib/site-admin-account-store";
import { sharedEnvironmentVariable } from "@/lib/shared-environment";

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
  const apiKey = sharedEnvironmentVariable("RESEND_API_KEY");
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

  if (error) throw emailDeliveryError(error);
}

export async function sendRecoveryEmailVerificationEmail(input: {
  email: string;
  playerName: string;
  verificationUrl: string;
}) {
  const apiKey = sharedEnvironmentVariable("RESEND_API_KEY");
  if (!apiKey) throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM?.trim() || "Game Fields <noreply@game-fields.com>";
  const safeName = escapeHtml(input.playerName);
  const safeUrl = escapeHtml(input.verificationUrl);
  const { error } = await resend.emails.send({
    from,
    to: input.email,
    subject: "【Game Fields】復旧用メールアドレスの確認",
    text: `${input.playerName} さん\n\nGame Fieldsの復旧用メールアドレスとして登録するには、以下のURLを開き「このメールを承認」を押してください。URLの有効期限は1時間です。\n${input.verificationUrl}\n\nこの登録に心当たりがない場合は、承認せずメールを破棄してください。`,
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
        <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
          <h1 style="font-size:22px;margin:0 0 20px">復旧用メールアドレスの確認</h1>
          <p>${safeName} さん</p>
          <p style="line-height:1.7">Game Fieldsの復旧用メールアドレスとして登録するには、以下のボタンから確認画面を開き、「このメールを承認」を押してください。このリンクの有効期限は1時間です。</p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">確認画面を開く</a>
          </p>
          <p style="font-size:13px;line-height:1.7;color:#475569">この登録に心当たりがない場合は、承認せずメールを破棄してください。メールアドレスや権限は変更されません。</p>
        </div>
      </div>
    `,
  });

  if (error) throw emailDeliveryError(error);
}

async function operationsEmailRecipients(kind: SiteAdminNotificationKind) {
  let registered: string[] = [];
  let lookupError: unknown = null;
  try {
    registered = await listSiteAdminNotificationEmails(kind);
  } catch (error) {
    lookupError = error;
    // Environment-configured recipients remain available during a database outage.
  }
  const recipients = mergeOperationsEmailRecipients(
    process.env.OPERATIONS_ALERT_EMAIL,
    registered,
  );
  if (recipients.length === 0 && lookupError) {
    throw new Error("OPERATIONS_EMAIL_RECIPIENT_LOOKUP_FAILED");
  }
  return recipients;
}

export async function sendOperationsAlertEmail(input: {
  subject: string;
  lines: string[];
  audience?: SiteAdminNotificationKind;
  replyTo?: string;
  idempotencyKey?: string;
}) {
  const apiKey = sharedEnvironmentVariable("RESEND_API_KEY");
  if (!apiKey) throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  const recipients = await operationsEmailRecipients(input.audience ?? "alerts");
  if (recipients.length === 0) {
    throw new Error("OPERATIONS_EMAIL_RECIPIENTS_NOT_CONFIGURED");
  }
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM?.trim() || "Game Fields <noreply@game-fields.com>";
  const text = input.lines.join("\n");
  const html = `<div style="font-family:sans-serif;line-height:1.7"><h1>${escapeHtml(input.subject)}</h1>${input.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>`;
  const baseIdempotencyKey = input.idempotencyKey?.trim().slice(0, 220);
  const results = await Promise.all(recipients.map((to, index) =>
    resend.emails.send({
      from,
      to,
      replyTo: input.replyTo,
      subject: input.subject,
      text,
      html,
    }, baseIdempotencyKey
      ? { idempotencyKey: `${baseIdempotencyKey}-${index}` }
      : undefined)));
  const firstError = results.find(({ error }) => error)?.error;
  if (firstError) throw emailDeliveryError(firstError);
  return { recipientCount: recipients.length };
}

export async function sendSupportReplyEmail(input: {
  to: string;
  subject: string;
  body: string;
  threadUrl: string;
  idempotencyKey: string;
}) {
  const apiKey = sharedEnvironmentVariable("RESEND_API_KEY");
  if (!apiKey) throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM?.trim()
    || "Game Fields <noreply@game-fields.com>";
  const safeBody = escapeHtml(input.body).replaceAll("\n", "<br />");
  const safeUrl = escapeHtml(input.threadUrl);
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: `${input.body}\n\n続けて返信する場合は、以下の専用ページを開いてください。\n${input.threadUrl}`,
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
          <h1 style="font-size:21px;margin:0 0 20px">Game Fieldsから返信が届きました</h1>
          <p style="line-height:1.8">${safeBody}</p>
          <p style="margin:28px 0 12px">
            <a href="${safeUrl}" style="display:inline-block;background:#0e7490;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">会話を確認・返信する</a>
          </p>
          <p style="font-size:12px;line-height:1.7;color:#64748b">この専用URLはお問い合わせ内容を表示します。第三者へ転送しないでください。</p>
        </div>
      </div>
    `,
  }, {
    idempotencyKey: input.idempotencyKey,
  });
  if (error) throw emailDeliveryError(error);
}

export async function sendCreatorSupportReplyEmail(input: {
  to: string;
  reportId: string;
  body: string;
  supportUrl: string;
  idempotencyKey: string;
}) {
  const apiKey = sharedEnvironmentVariable("RESEND_API_KEY");
  if (!apiKey) throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM?.trim()
    || "Game Fields <noreply@game-fields.com>";
  const safeReportId = escapeHtml(input.reportId);
  const safeBody = escapeHtml(input.body).replaceAll("\n", "<br />");
  const safeUrl = escapeHtml(input.supportUrl);
  const guidance = "このメールは返信通知です。会話履歴と対応状態はSDK Portalのサポート画面で確認し、続きも同画面から返信してください。接続中のAIからも同じスレッドを確認できます。";
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: `【Game Fields】報告への返信 ${input.reportId}`,
    text: `Game Fields運営から返信が届きました。\n報告ID: ${input.reportId}\n\n${input.body}\n\n${guidance}\n${input.supportUrl}\n\nGPTで続ける場合は、Game Fields SDK toolsを接続したGPTへ次の報告IDだけを貼り付けてください。経緯と安全な返信手順は自動で読み込まれます。\n\n${input.reportId}`,
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
          <h1 style="font-size:21px;margin:0 0 20px">Game Fields運営から返信が届きました</h1>
          <p style="font-size:13px;color:#64748b">報告ID: <strong>${safeReportId}</strong></p>
          <p style="line-height:1.8">${safeBody}</p>
          <p style="line-height:1.8;color:#475569">${escapeHtml(guidance)}</p>
          <p style="margin:28px 0 12px">
            <a href="${safeUrl}" style="display:inline-block;background:#0e7490;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">SDK Portalで会話を確認・返信する</a>
          </p>
          <div style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:22px">
            <p style="font-weight:700;margin:0 0 10px">GPTで続きを引き継ぐ</p>
            <p style="font-size:13px;line-height:1.7;color:#475569">Game Fields SDK toolsを接続したGPTへ、次の報告IDだけを貼り付けてください。経緯と安全な返信手順は自動で読み込まれます。</p>
            <div style="white-space:pre-wrap;word-break:break-word;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:14px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;line-height:1.7">${safeReportId}</div>
          </div>
        </div>
      </div>
    `,
  }, {
    idempotencyKey: input.idempotencyKey,
  });
  if (error) throw emailDeliveryError(error);
}

export async function sendContactReceiptEmail(input: {
  to: string;
  contactId: string;
  threadUrl: string;
}) {
  const apiKey = sharedEnvironmentVariable("RESEND_API_KEY");
  if (!apiKey) throw new Error("EMAIL_SERVICE_NOT_CONFIGURED");
  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM?.trim()
    || "Game Fields <noreply@game-fields.com>";
  const safeId = escapeHtml(input.contactId);
  const safeUrl = escapeHtml(input.threadUrl);
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: `【Game Fields】お問い合わせを受け付けました ${input.contactId}`,
    text: `お問い合わせを受け付けました。\n受付ID: ${input.contactId}\n\n以下の専用ページで返信の確認と追記ができます。\n${input.threadUrl}`,
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
          <h1 style="font-size:21px;margin:0 0 20px">お問い合わせを受け付けました</h1>
          <p>受付ID: <strong>${safeId}</strong></p>
          <p style="line-height:1.8">運営からの返信確認や追加情報の送信は、以下の専用ページをご利用ください。</p>
          <p style="margin:28px 0 12px">
            <a href="${safeUrl}" style="display:inline-block;background:#0e7490;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">お問い合わせ履歴を開く</a>
          </p>
          <p style="font-size:12px;line-height:1.7;color:#64748b">この専用URLはお問い合わせ内容を表示します。第三者へ転送しないでください。</p>
        </div>
      </div>
    `,
  }, {
    idempotencyKey: `contact-receipt-${input.contactId}`,
  });
  if (error) throw emailDeliveryError(error);
}
