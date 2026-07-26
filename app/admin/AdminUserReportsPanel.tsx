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
  open: "未対応",
  "in-progress": "確認中",
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
              <p className="text-xs text-slate-500">報告ID: {report.id} ／ プレイヤーID: {report.playerId}</p>
              <div className="flex flex-wrap gap-2" aria-label="対応状態を変更">
                {userReportStatuses.map((status) => <button key={status} type="button" disabled={savingId !== null || report.status === status} onClick={() => void updateStatus(report, status)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-40">{statusLabels[status]}</button>)}
              </div>
            </div>
          </details>
        ))}
        {!loading && !visibleReports.length && <p className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-12 text-center text-sm text-slate-400">この状態の報告はありません。</p>}
      </div>
    </div>
  );
}
