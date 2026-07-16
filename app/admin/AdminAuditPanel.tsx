"use client";

import { useEffect, useState } from "react";

type AuditEntry = {
  id: string;
  actorEmail: string | null;
  authMethod: string;
  action: string;
  target: string;
  beforeValue: unknown;
  afterValue: unknown;
  createdAt: number;
};

function compact(value: unknown) {
  if (value === null || value === undefined) return "―";
  const serialized = JSON.stringify(value);
  return serialized.length > 240 ? `${serialized.slice(0, 240)}…` : serialized;
}

export function AdminAuditPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/audit-logs", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => null) as { logs?: AuditEntry[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.logs) throw new Error(data?.error || "LOAD_FAILED");
      setLogs(data.logs);
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage("監査ログを読み込めませんでした。");
    });
    return () => controller.abort();
  }, [onAuthExpired]);

  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-8"><div><h2 className="text-2xl font-black">監査ログ</h2><p className="mt-1 text-sm leading-6 text-slate-400">管理者ログイン、再認証、アカウント・サイト設定・公開状態の変更を新しい順に100件表示します。</p></div>{message && <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{message}</p>}<div className="space-y-3">{logs.map((entry) => <details key={entry.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-4"><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">{entry.action}</p><p className="mt-1 text-xs text-slate-400">{entry.actorEmail ?? "マスター"} ・ {entry.authMethod} ・ {entry.target}</p></div><time className="text-xs text-slate-400">{new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(entry.createdAt))}</time></div></summary><div className="mt-4 grid gap-3 border-t border-white/10 pt-4 md:grid-cols-2"><div><p className="text-xs font-bold text-slate-500">変更前</p><pre className="mt-1 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{compact(entry.beforeValue)}</pre></div><div><p className="text-xs font-bold text-slate-500">変更後</p><pre className="mt-1 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-300">{compact(entry.afterValue)}</pre></div></div></details>)}{!logs.length && !message && <p className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-12 text-center text-sm text-slate-400">監査ログはまだありません。</p>}</div></div>;
}
