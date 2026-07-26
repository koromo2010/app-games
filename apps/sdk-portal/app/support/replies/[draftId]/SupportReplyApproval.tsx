"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  CreatorSupportReplyDraft,
  CreatorSupportReport,
} from "@/lib/support-api";

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

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !message.trim()) return;
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
          maxLength={3_000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
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
        <button type="submit" disabled={saving || !message.trim()}>
          {saving ? "送信中…" : "内容を確認し、返信を送信"}
        </button>
      </div>
    </form>
  </section>;
}
