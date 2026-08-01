"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SUPPORT_TEXT_LIMITS } from "@/lib/support-text-contract";

type ReportType = "bug" | "request";

export function NewSupportReportForm() {
  const router = useRouter();
  const requestIdRef = useRef<string | null>(null);
  const [type, setType] = useState<ReportType>("bug");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [page, setPage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const summaryTooLong = summary.length > SUPPORT_TEXT_LIMITS.summary;
  const detailsTooLong = details.length > SUPPORT_TEXT_LIMITS.details;
  const pageTooLong = page.length > SUPPORT_TEXT_LIMITS.page;
  const textInvalid = summaryTooLong || detailsTooLong || pageTooLong;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !summary.trim() || textInvalid) {
      setError("文字数上限を超えた項目を修正してください。超過中の内容は保存されません。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      requestIdRef.current ??= crypto.randomUUID();
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-report",
          requestId: requestIdRef.current,
          type,
          summary,
          details,
          page,
        }),
      });
      const data = await response.json().catch(() => null) as {
        report?: { id?: string };
        error?: string;
        field?: string;
        limit?: number;
      } | null;
      if (!response.ok || !data?.report?.id) {
        if (data?.error === "support_text_too_long") {
          setError(`${data.field ?? "入力"}は${data.limit ?? "規定"}文字以内にしてください。`);
          return;
        }
        throw new Error("REPORT_FAILED");
      }
      router.push(
        `/support?thread=${encodeURIComponent(data.report.id)}`,
      );
      router.refresh();
    } catch {
      setError(
        "報告を送信できませんでした。入力内容を保持したまま、もう一度お試しください。",
      );
    } finally {
      setSaving(false);
    }
  };

  return <section className="support-approval">
    <p className="eyebrow">NEW SUPPORT REPORT</p>
    <h1>新規報告を作成</h1>
    <p className="support-approval-lead">
      不具合や改善要望をここから直接送れます。送信後はサポート画面で運営との会話を続けられます。
    </p>
    <form onSubmit={submit}>
      <label>種別
        <select
          value={type}
          onChange={(event) => setType(event.target.value as ReportType)}
        >
          <option value="bug">不具合報告</option>
          <option value="request">改善要望</option>
        </select>
      </label>
      <label>要約
        <input
          autoFocus
          required
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="例：ゲーム開始ボタンを押しても反応しない"
        />
        <small>{summary.length.toLocaleString()} / {SUPPORT_TEXT_LIMITS.summary.toLocaleString()}</small>
        {summaryTooLong && <span className="support-approval-error" role="alert">要約が文字数上限を超えています。</span>}
      </label>
      <label>詳細・再現手順
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="行った操作、期待した結果、実際に起きたことなど"
        />
        <small>{details.length.toLocaleString()} / {SUPPORT_TEXT_LIMITS.details.toLocaleString()}</small>
        {detailsTooLong && <span className="support-approval-error" role="alert">詳細が文字数上限を超えています。</span>}
      </label>
      <label>対象ページ・ゲームURL（任意）
        <input
          value={page}
          onChange={(event) => setPage(event.target.value)}
          placeholder="https://sdk.game-fields.com/..."
        />
        <small>{page.length.toLocaleString()} / {SUPPORT_TEXT_LIMITS.page.toLocaleString()}</small>
        {pageTooLong && <span className="support-approval-error" role="alert">対象ページが文字数上限を超えています。</span>}
      </label>
      <p className="support-form-hint">
        パスワード、APIキー、Cookieなどの秘密情報は入力しないでください。
      </p>
      {error && <p className="support-approval-error" role="alert">{error}</p>}
      <div className="support-approval-actions">
        <button
          type="button"
          className="secondary-action"
          onClick={() => router.push("/support")}
        >
          キャンセル
        </button>
        <button type="submit" disabled={saving || !summary.trim() || textInvalid}>
          {saving ? "送信中…" : "内容を確認し、報告を送信"}
        </button>
      </div>
    </form>
  </section>;
}
