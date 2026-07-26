"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || !summary.trim()) return;
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
      } | null;
      if (!response.ok || !data?.report?.id) {
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
          maxLength={120}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="例：ゲーム開始ボタンを押しても反応しない"
        />
      </label>
      <label>詳細・再現手順
        <textarea
          maxLength={1_200}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder="行った操作、期待した結果、実際に起きたことなど"
        />
      </label>
      <label>対象ページ・ゲームURL（任意）
        <input
          maxLength={200}
          value={page}
          onChange={(event) => setPage(event.target.value)}
          placeholder="https://sdk.game-fields.com/..."
        />
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
        <button type="submit" disabled={saving || !summary.trim()}>
          {saving ? "送信中…" : "内容を確認し、報告を送信"}
        </button>
      </div>
    </form>
  </section>;
}
