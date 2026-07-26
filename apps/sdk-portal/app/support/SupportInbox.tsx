"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type {
  CreatorSupportReport,
  CreatorSupportStatus,
} from "@/lib/support-api";

const statusLabels: Record<CreatorSupportStatus, string> = {
  open: "オープン",
  "in-progress": "確認中",
  "waiting-user": "あなたの返信待ち",
  resolved: "対応済み",
  closed: "終了",
};

const typeLabels = {
  bug: "不具合報告",
  request: "改善要望",
} as const;

type Filter = "all" | CreatorSupportStatus;

function formatDate(value: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SupportInbox({
  initialReports,
  initialLoadFailed,
  initialThreadId,
}: {
  initialReports: CreatorSupportReport[];
  initialLoadFailed: boolean;
  initialThreadId: string | null;
}) {
  const [reports, setReports] = useState(initialReports);
  const [filter, setFilter] = useState<Filter>("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(
    initialLoadFailed ? "報告一覧を読み込めませんでした。" : "",
  );
  const replyRequestIds = useRef<Record<string, string>>({});

  const visibleReports = useMemo(
    () => filter === "all"
      ? reports
      : reports.filter((report) => report.status === filter),
    [filter, reports],
  );

  const reload = async () => {
    if (loading) return;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch("/api/support", { cache: "no-store" });
      const data = await response.json().catch(() => null) as {
        reports?: CreatorSupportReport[];
      } | null;
      if (!response.ok || !data?.reports) throw new Error("LOAD_FAILED");
      setReports(data.reports);
    } catch {
      setNotice("報告一覧を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  };

  const reply = async (report: CreatorSupportReport) => {
    const message = drafts[report.id]?.trim() ?? "";
    if (!message || savingId) return;
    setSavingId(report.id);
    setNotice("");
    try {
      const requestId = replyRequestIds.current[report.id]
        ?? crypto.randomUUID();
      replyRequestIds.current[report.id] = requestId;
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          requestId,
          message,
        }),
      });
      const data = await response.json().catch(() => null) as {
        report?: CreatorSupportReport;
      } | null;
      if (!response.ok || !data?.report) throw new Error("REPLY_FAILED");
      delete replyRequestIds.current[report.id];
      setReports((current) => current.map((entry) => (
        entry.id === data.report!.id ? data.report! : entry
      )));
      setDrafts((current) => ({ ...current, [report.id]: "" }));
      setNotice("追記を送信し、状態をオープンへ戻しました。");
    } catch {
      setNotice("追記を送信できませんでした。");
    } finally {
      setSavingId(null);
    }
  };

  return <section className="support-main">
    <div className="dashboard-heading support-heading">
      <div>
        <p className="eyebrow">SUPPORT THREADS</p>
        <h1>サポート</h1>
        <p>ゲーム画面から送った報告と、運営からの返信を同じスレッドで確認できます。追記すると状態は自動でオープンに戻ります。</p>
      </div>
      <div className="support-heading-actions">
        <Link className="primary-action" href="/support/new">
          新規報告を作成 <span aria-hidden="true">＋</span>
        </Link>
        <button className="secondary-action" type="button" disabled={loading} onClick={() => void reload()}>
          {loading ? "読込中…" : "再読み込み"}
        </button>
      </div>
    </div>

    <div className="support-filters" role="tablist" aria-label="報告の状態">
      {(["all", "open", "in-progress", "waiting-user", "resolved", "closed"] as const).map((value) => {
        const count = value === "all"
          ? reports.length
          : reports.filter((report) => report.status === value).length;
        return <button
          key={value}
          type="button"
          role="tab"
          aria-selected={filter === value}
          onClick={() => setFilter(value)}
        >
          {value === "all" ? "すべて" : statusLabels[value]} {count}
        </button>;
      })}
    </div>

    {notice && <p className="support-notice" role="status">{notice}</p>}

    <div className="support-list">
      {visibleReports.map((report) => <details
        className="support-thread"
        id={`support-${report.id}`}
        key={report.id}
        open={report.id === initialThreadId ? true : undefined}
      >
        <summary>
          <div>
            <span className={`support-type support-type--${report.type}`}>{typeLabels[report.type]}</span>
            <span className={`support-status support-status--${report.status}`}>{statusLabels[report.status]}</span>
            <h2>{report.summary}</h2>
            <small>{report.page || "ページ情報なし"} · {report.id}</small>
          </div>
          <time>{formatDate(report.updatedAt)}</time>
        </summary>
        <div className="support-conversation">
          <article className="support-message support-message--requester">
            <header><strong>あなた</strong><time>{formatDate(report.createdAt)}</time></header>
            <p>{report.details || report.summary}</p>
          </article>
          {report.messages.map((message) => <article
            className={`support-message support-message--${message.author}`}
            key={message.id}
          >
            <header>
              <strong>{message.author === "admin" ? "Game Fields運営" : "あなた"}</strong>
              <time>{formatDate(message.createdAt)}</time>
            </header>
            <p>{message.body}</p>
          </article>)}
        </div>
        <form className="support-reply" onSubmit={(event) => {
          event.preventDefault();
          void reply(report);
        }}>
          <label htmlFor={`reply-${report.id}`}>追記・返信</label>
          <textarea
            id={`reply-${report.id}`}
            maxLength={3_000}
            value={drafts[report.id] ?? ""}
            onChange={(event) => {
              delete replyRequestIds.current[report.id];
              setDrafts((current) => ({
                ...current,
                [report.id]: event.target.value,
              }));
            }}
            placeholder="確認結果や再現手順などを入力してください"
          />
          <div>
            <small>送信すると状態は「オープン」になります。</small>
            <button type="submit" disabled={savingId !== null || !(drafts[report.id]?.trim())}>
              {savingId === report.id ? "送信中…" : "追記を送信"}
            </button>
          </div>
        </form>
      </details>)}
      {!visibleReports.length && <div className="dashboard-empty">
        <p className="eyebrow">NO SUPPORT THREADS</p>
        <h2>この状態の報告はありません</h2>
        <p>ゲーム画面からだけでなく、このサポート画面からも不具合や改善要望を送れます。</p>
        <Link className="primary-action" href="/support/new">新規報告を作成 <span aria-hidden="true">→</span></Link>
      </div>}
    </div>
  </section>;
}
