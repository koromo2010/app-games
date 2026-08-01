export type SupportEmailReference = {
  kind: "contact" | "report";
  id: string;
};

export type SupportEmailContent = {
  subject: string;
  text: string;
  html: string;
};

const supportEmailLabels = {
  contact: {
    subject: "問い合わせ",
    reference: "受付ID",
  },
  report: {
    subject: "報告",
    reference: "報告ID",
  },
} as const;

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function supportEmailSubject(
  reference: SupportEmailReference,
  title: string,
) {
  return `[Game Fields][${supportEmailLabels[reference.kind].subject}]`
    + `[${reference.id}] ${title}`;
}

export function supportEmailReferenceText(
  reference: SupportEmailReference,
) {
  return `${supportEmailLabels[reference.kind].reference}：${reference.id}`;
}

export function supportEmailReferenceHtml(
  reference: SupportEmailReference,
) {
  const label = escapeEmailHtml(
    supportEmailLabels[reference.kind].reference,
  );
  const id = escapeEmailHtml(reference.id);
  return `
    <div style="margin:0 0 20px">
      <div style="user-select:all;white-space:pre-wrap;word-break:break-all;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;padding:12px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;line-height:1.6;color:#0f172a">${label}：${id}</div>
    </div>
  `;
}

export function buildOperationsEmailContent(input: {
  subject: string;
  lines: string[];
  supportReference?: SupportEmailReference;
}): SupportEmailContent {
  const referenceText = input.supportReference
    ? supportEmailReferenceText(input.supportReference)
    : null;
  const text = referenceText
    ? [referenceText, "", ...input.lines].join("\n")
    : input.lines.join("\n");
  const referenceHtml = input.supportReference
    ? supportEmailReferenceHtml(input.supportReference)
    : "";
  const linesHtml = input.lines
    .map((line) => `<p>${escapeEmailHtml(line)}</p>`)
    .join("");
  return {
    subject: input.subject,
    text,
    html: `<div style="font-family:sans-serif;line-height:1.7"><h1>${escapeEmailHtml(input.subject)}</h1>${referenceHtml}${linesHtml}</div>`,
  };
}

export function buildContactReceiptEmailContent(input: {
  contactId: string;
  threadUrl: string;
}): SupportEmailContent {
  const reference = {
    kind: "contact",
    id: input.contactId,
  } satisfies SupportEmailReference;
  const safeUrl = escapeEmailHtml(input.threadUrl);
  return {
    subject: supportEmailSubject(
      reference,
      "お問い合わせを受け付けました",
    ),
    text: `お問い合わせを受け付けました。\n${supportEmailReferenceText(reference)}\n\n以下の専用ページで返信の確認と追記ができます。\n${input.threadUrl}`,
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
          <h1 style="font-size:21px;margin:0 0 20px">お問い合わせを受け付けました</h1>
          ${supportEmailReferenceHtml(reference)}
          <p style="line-height:1.8">運営からの返信確認や追加情報の送信は、以下の専用ページをご利用ください。</p>
          <p style="margin:28px 0 12px">
            <a href="${safeUrl}" style="display:inline-block;background:#0e7490;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">お問い合わせ履歴を開く</a>
          </p>
          <p style="font-size:12px;line-height:1.7;color:#64748b">この専用URLはお問い合わせ内容を表示します。第三者へ転送しないでください。</p>
        </div>
      </div>
    `,
  };
}

export function buildContactReplyEmailContent(input: {
  contactId: string;
  body: string;
  threadUrl: string;
}): SupportEmailContent {
  const reference = {
    kind: "contact",
    id: input.contactId,
  } satisfies SupportEmailReference;
  const safeBody = escapeEmailHtml(input.body).replaceAll("\n", "<br />");
  const safeUrl = escapeEmailHtml(input.threadUrl);
  return {
    subject: supportEmailSubject(reference, "お問い合わせへの返信"),
    text: `Game Fieldsから返信が届きました。\n${supportEmailReferenceText(reference)}\n\n${input.body}\n\n続けて返信する場合は、以下の専用ページを開いてください。\n${input.threadUrl}`,
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
          <h1 style="font-size:21px;margin:0 0 20px">Game Fieldsから返信が届きました</h1>
          ${supportEmailReferenceHtml(reference)}
          <p style="line-height:1.8">${safeBody}</p>
          <p style="margin:28px 0 12px">
            <a href="${safeUrl}" style="display:inline-block;background:#0e7490;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">会話を確認・返信する</a>
          </p>
          <p style="font-size:12px;line-height:1.7;color:#64748b">この専用URLはお問い合わせ内容を表示します。第三者へ転送しないでください。</p>
        </div>
      </div>
    `,
  };
}

export function buildCreatorSupportReplyEmailContent(input: {
  reportId: string;
  body: string;
  supportUrl: string;
}): SupportEmailContent {
  const reference = {
    kind: "report",
    id: input.reportId,
  } satisfies SupportEmailReference;
  const safeBody = escapeEmailHtml(input.body).replaceAll("\n", "<br />");
  const safeUrl = escapeEmailHtml(input.supportUrl);
  const safeReportId = escapeEmailHtml(input.reportId);
  const guidance = "このメールは返信通知です。会話履歴と対応状態はSDK Portalのサポート画面で確認し、続きも同画面から返信してください。接続中のAIからも同じスレッドを確認できます。";
  return {
    subject: supportEmailSubject(reference, "報告への返信"),
    text: `Game Fields運営から返信が届きました。\n${supportEmailReferenceText(reference)}\n\n${input.body}\n\n${guidance}\n${input.supportUrl}\n\nGPTで続ける場合は、Game Fields SDK toolsを接続したGPTへ次の報告IDだけを貼り付けてください。経緯と安全な返信手順は自動で読み込まれます。\n\n${input.reportId}`,
    html: `
      <div style="background:#f8fafc;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
          <h1 style="font-size:21px;margin:0 0 20px">Game Fields運営から返信が届きました</h1>
          ${supportEmailReferenceHtml(reference)}
          <p style="line-height:1.8">${safeBody}</p>
          <p style="line-height:1.8;color:#475569">${escapeEmailHtml(guidance)}</p>
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
  };
}
