"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CreatorSupportDraft } from "@/lib/support-api";
import { SUPPORT_TEXT_LIMITS } from "@/lib/support-text-contract";

export function SupportDraftApproval({
  draft,
}: {
  draft: CreatorSupportDraft;
}) {
  const router = useRouter();
  const [type, setType] = useState(draft.type);
  const [summary, setSummary] = useState(draft.summary);
  const [details, setDetails] = useState(draft.details);
  const [page, setPage] = useState(draft.page);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const summaryTooLong = summary.length > SUPPORT_TEXT_LIMITS.summary;
  const detailsTooLong = details.length > SUPPORT_TEXT_LIMITS.details;
  const pageTooLong = page.length > SUPPORT_TEXT_LIMITS.page;
  const textInvalid = summaryTooLong || detailsTooLong || pageTooLong;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !summary.trim() || textInvalid) {
      setError("文字数上限を超えた項目を修正してください。超過中の内容は保存されません。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/support/drafts/${draft.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, summary, details, page }),
      });
      if (!response.ok) throw new Error("APPROVAL_FAILED");
      router.push("/support");
      router.refresh();
    } catch {
      setError("報告を送信できませんでした。内容を保持したまま、もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  return <section className="support-approval">
    <p className="eyebrow">HUMAN APPROVAL REQUIRED</p>
    <h1>AIが作成した報告下書き</h1>
    <p className="support-approval-lead">まだ運営へ送信されていません。内容を確認・修正し、同意する場合だけ送信してください。</p>
    <form onSubmit={submit}>
      <label>種別
        <select value={type} onChange={(event) => setType(event.target.value as "bug" | "request")}>
          <option value="bug">不具合報告</option>
          <option value="request">改善要望</option>
        </select>
      </label>
      <label>要約
        <input required value={summary} onChange={(event) => setSummary(event.target.value)} />
        <small>{summary.length.toLocaleString()} / {SUPPORT_TEXT_LIMITS.summary.toLocaleString()}</small>
        {summaryTooLong && <span className="support-approval-error" role="alert">要約が文字数上限を超えています。</span>}
      </label>
      <label>詳細・再現手順
        <textarea value={details} onChange={(event) => setDetails(event.target.value)} />
        <small>{details.length.toLocaleString()} / {SUPPORT_TEXT_LIMITS.details.toLocaleString()}</small>
        {detailsTooLong && <span className="support-approval-error" role="alert">詳細が文字数上限を超えています。</span>}
      </label>
      <label>対象ページ
        <input value={page} onChange={(event) => setPage(event.target.value)} />
        <small>{page.length.toLocaleString()} / {SUPPORT_TEXT_LIMITS.page.toLocaleString()}</small>
        {pageTooLong && <span className="support-approval-error" role="alert">対象ページが文字数上限を超えています。</span>}
      </label>
      {error && <p className="support-approval-error" role="alert">{error}</p>}
      <div className="support-approval-actions">
        <button type="button" className="secondary-action" onClick={() => router.push("/support")}>送信しない</button>
        <button type="submit" disabled={saving || !summary.trim() || textInvalid}>{saving ? "送信中…" : "内容を確認し、報告を送信"}</button>
      </div>
    </form>
  </section>;
}
