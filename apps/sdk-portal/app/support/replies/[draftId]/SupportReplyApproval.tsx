"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CreatorSupportReplyDraft,
  CreatorSupportReport,
} from "@/lib/support-api";
import { SUPPORT_TEXT_LIMITS } from "@/lib/support-text-contract";

export function SupportReplyApproval({
  draft,
  report,
}: {
  draft: CreatorSupportReplyDraft;
  report: CreatorSupportReport;
}) {
  const router = useRouter();
  const [message, setMessage] = useState(draft.message);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const messageTooLong = message.length > SUPPORT_TEXT_LIMITS.reply;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !message.trim() || messageTooLong) {
      setError("返信が文字数上限を超えています。超過中の内容は保存されません。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/support/replies/${draft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) throw new Error("APPROVAL_FAILED");
      router.push(`/support?thread=${encodeURIComponent(report.id)}`);
      router.refresh();
    } catch {
      setError("返信を送信できませんでした。内容を保持したまま、もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return <section className="support-approval">
    <p className="eyebrow">HUMAN APPROVAL REQUIRED</p>
    <h1>AIが作成した返信下書き</h1>
    <p className="support-approval-lead">
      まだ投稿されておらず、スレッドの状態も変わっていません。内容を確認・修正し、同意する場合だけ送信してください。
    </p>
    <form onSubmit={submit}>
      <div>
        <p className="eyebrow">THREAD</p>
        <strong>{report.summary}</strong>
        <p>{report.id}</p>
      </div>
      <label htmlFor="support-reply-message">返信内容
        <textarea
          id="support-reply-message"
          required
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <small>{message.length.toLocaleString()} / {SUPPORT_TEXT_LIMITS.reply.toLocaleString()}</small>
        {messageTooLong && <span className="support-approval-error" role="alert">返信が文字数上限を超えています。</span>}
      </label>
      {error && <p className="support-approval-error" role="alert">{error}</p>}
      <div className="support-approval-actions">
        <button
          type="button"
          className="secondary-action"
          onClick={() => router.push(`/support?thread=${encodeURIComponent(report.id)}`)}
        >
          送信しない
        </button>
        <button type="submit" disabled={saving || !message.trim() || messageTooLong}>
          {saving ? "送信中…" : "内容を確認し、返信を送信"}
        </button>
      </div>
    </form>
  </section>;
}
