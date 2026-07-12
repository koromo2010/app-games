import { Resend } from "resend";

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
