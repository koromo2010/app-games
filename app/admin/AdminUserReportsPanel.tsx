"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import {
  userReportStatuses,
  type UserReport,
  type UserReportStatus,
  type UserReportType,
} from "@/lib/user-report-core";

const statusLabels: Record<UserReportStatus, string> = {
  open: "オープン",
  "in-progress": "確認中",
  "waiting-user": "ユーザー返信待ち",
  resolved: "対応済み",
  closed: "見送り・終了",
};

const typeLabels: Record<UserReportType, string> = {
  bug: "バグ報告",
  request: "改善要望",
};

type ReportFilter = "all" | UserReportStatus;

export function AdminUserReportsPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [filter, setFilter] = useState<ReportFilter>("open");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyStatuses, setReplyStatuses] = useState<Record<string, UserReportStatus>>({});
  const [message, setMessage] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/user-reports", {
        cache: "no-store",
        signal,
      });
      const data = await response.json().catch(() => null) as {
        reports?: UserReport[];
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      if (!response.ok || !data?.reports) throw new Error(data?.error || "LOAD_FAILED");
      setReports(data.reports);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("報告一覧を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  }, [onAuthExpired]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const visibleReports = useMemo(
    () => filter === "all" ? reports : reports.filter((report) => report.status === filter),
    [filter, reports],
  );

  const updateStatus = async (report: UserReport, status: UserReportStatus) => {
    if (savingId || report.status === status) return;
    setSavingId(report.id);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/user-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, status }),
      });
      const data = await response.json().catch(() => null) as {
        report?: UserReport;
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      if (!response.ok || !data?.report) throw new Error(data?.error || "SAVE_FAILED");
      setReports((current) => current.map((entry) => entry.id === data.report!.id ? data.report! : entry));
      setMessage(`「${report.summary}」を${statusLabels[status]}に更新しました。`);
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") onAuthExpired();
      setMessage("対応状態を更新できませんでした。");
    } finally {
      setSavingId(null);
    }
  };

  const sendReply = async (report: UserReport) => {
    const reply = drafts[report.id]?.trim() ?? "";
    if (!reply || savingId) return;
    setSavingId(report.id);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/user-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          requestId: crypto.randomUUID(),
          message: reply,
          status: replyStatuses[report.id] ?? "waiting-user",
        }),
      });
      const data = await response.json().catch(() => null) as {
        report?: UserReport;
        deliveryStatus?: "sent" | "failed" | "not-required";
        error?: string;
      } | null;
      if (response.status === 401) {
        onAuthExpired();
        return;
      }
      if (!response.ok || !data?.report) {
        throw new Error(data?.error || "REPLY_FAILED");
      }
      setReports((current) => current.map((entry) => (
        entry.id === data.report!.id ? data.report! : entry
      )));
      setDrafts((current) => ({ ...current, [report.id]: "" }));
      setMessage(data.deliveryStatus === "failed"
        ? "返信はPortalへ保存しましたが、メール通知に失敗しました。"
        : data.deliveryStatus === "not-required"
          ? "返信はPortalへ保存しました。確認済みメールがないため、メール通知は送っていません。"
          : `「${report.summary}」へ返信し、メールでも通知しました。`);
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_AUTH_REQUIRED") {
        onAuthExpired();
      }
      setMessage("返信を送信できませんでした。");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">改善・バグ報告</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">ゲーム画面の共通メニューから届いた報告を新しい順に表示します。</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40">{loading ? "読込中…" : "再読み込み"}</button>
      </div>
      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="報告の対応状態">
        {(["all", ...userReportStatuses] as const).map((value) => {
          const count = value === "all" ? reports.length : reports.filter((report) => report.status === value).length;
          return <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${filter === value ? "bg-cyan-300 text-slate-950" : "border border-white/15 text-slate-300 hover:bg-white/10"}`}>{value === "all" ? "すべて" : statusLabels[value]} {count}</button>;
        })}
      </div>
      {message && <p role="status" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">{message}</p>}
      <div className="space-y-3">
        {visibleReports.map((report) => (
          <details key={report.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <span className={report.type === "bug" ? "rounded-full bg-rose-300/15 px-2 py-1 text-rose-200" : "rounded-full bg-violet-300/15 px-2 py-1 text-violet-200"}>{typeLabels[report.type]}</span>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-slate-300">{statusLabels[report.status]}</span>
                  </div>
                  <p className="mt-2 break-words font-black">{report.summary}</p>
                  <p className="mt-1 text-xs text-slate-400">{report.page || "ページ情報なし"}</p>
                </div>
                <time className="text-xs text-slate-400">{new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.createdAt))}</time>
              </div>
            </summary>
            <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
              <div>
                <p className="text-xs font-bold text-slate-500">詳しい内容</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{report.details || "詳しい内容はありません。"}</p>
              </div>
              <div className="space-y-2 rounded-xl bg-slate-950/45 p-3">
                <p className="text-xs font-bold text-slate-500">やりとり</p>
                <article className="ml-auto max-w-[90%] rounded-lg bg-cyan-300/10 p-3">
                  <div className="flex justify-between gap-3 text-xs font-bold text-cyan-100"><span>報告者</span><time>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(report.createdAt))}</time></div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{report.details || report.summary}</p>
                </article>
                {report.messages.map((entry) => <article key={entry.id} className={`max-w-[90%] rounded-lg p-3 ${entry.author === "admin" ? "mr-auto border border-white/10 bg-white/[0.04]" : "ml-auto bg-cyan-300/10"}`}>
                  <div className="flex justify-between gap-3 text-xs font-bold text-slate-400"><span>{entry.author === "admin" ? "運営" : "報告者"}</span><time>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt))}</time></div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{entry.body}</p>
                  {entry.author === "admin" && entry.deliveryStatus === "failed" && <p className="mt-2 text-xs font-bold text-amber-200">メール通知失敗</p>}
                  {entry.author === "admin" && entry.deliveryStatus === "not-required" && <p className="mt-2 text-xs text-slate-500">確認済みメールなし・Portalのみ</p>}
                </article>)}
              </div>
              <p className="text-xs text-slate-500">報告ID: {report.id} ／ プレイヤーID: {report.playerId}</p>
              <div className="flex flex-wrap gap-2" aria-label="対応状態を変更">
                {userReportStatuses.map((status) => <button key={status} type="button" disabled={savingId !== null || report.status === status} onClick={() => void updateStatus(report, status)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40">{statusLabels[status]}</button>)}
              </div>
              <form className="space-y-3 border-t border-white/10 pt-4" onSubmit={(event) => {
                event.preventDefault();
                void sendReply(report);
              }}>
                <label className="block text-xs font-bold text-slate-400">返信（SDK Portalへ保存し、確認済みメールにも通知）
                  <textarea value={drafts[report.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [report.id]: event.target.value }))} maxLength={3000} className="mt-2 min-h-28 w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm font-normal text-white" placeholder="確認結果や追加で必要な情報を入力" />
                </label>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <label className="text-xs font-bold text-slate-400">返信後の状態
                    <select value={replyStatuses[report.id] ?? "waiting-user"} onChange={(event) => setReplyStatuses((current) => ({ ...current, [report.id]: event.target.value as UserReportStatus }))} className="mt-1 block rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white">
                      {userReportStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                    </select>
                  </label>
                  <button type="submit" disabled={savingId !== null || !(drafts[report.id]?.trim())} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40">{savingId === report.id ? "送信中…" : "返信を送信"}</button>
                </div>
              </form>
            </div>
          </details>
        ))}
        {!loading && !visibleReports.length && <p className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-12 text-center text-sm text-slate-400">この状態の報告はありません。</p>}
      </div>
    </div>
  );
}
