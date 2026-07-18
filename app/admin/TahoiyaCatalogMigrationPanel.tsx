"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import type { TahoiyaCatalogMigrationStatus } from "@/lib/tahoiya-catalog-migration";

type MigrationResult = {
  processed: number;
  imported: number;
  historyMemberships: number;
  nextCursor: string;
  done: boolean;
  status: TahoiyaCatalogMigrationStatus | null;
};

function errorMessage(code: string | undefined) {
  if (code === "TAHOIYA_CATALOG_SCHEMA_MISSING") return "先に共通単語DBへ 009_tahoiya_catalog.sql を適用してください。";
  if (code === "TAHOIYA_CATALOG_MIGRATION_PREVIEW_ONLY") return "この移行はdevelop Previewだけで実行できます。";
  if (code === "VOCABULARY_ADMIN_STORE_NOT_CONFIGURED") return "共通単語DBの管理接続がありません。";
  if (code === "ADMIN_STEP_UP_REQUIRED") return "パスキー確認の有効時間が切れました。もう一度実行してください。";
  return code || "たほい屋カタログの移行状態を確認できませんでした。";
}

export function TahoiyaCatalogMigrationPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [status, setStatus] = useState<TahoiyaCatalogMigrationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch("/api/admin/tahoiya-catalog-migration", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { status?: TahoiyaCatalogMigrationStatus; error?: string } | null;
    if (response.status === 401) { onAuthExpired(); return; }
    if (!response.ok || !data?.status) { setMessage(errorMessage(data?.error)); setLoading(false); return; }
    setStatus(data.status); setLoading(false);
  }, [onAuthExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const migrate = async () => {
    if (!status || migrating || status.complete) return;
    if (!window.confirm("旧Redisのお題と既出履歴を共通DB／プレイヤー別Setへ移します。旧データは削除しません。続けますか？")) return;
    setMigrating(true); setMessage(""); setProcessed(0);
    try {
      await ensureSiteAdminStepUp();
      let cursor = "0";
      let totalProcessed = 0;
      let totalHistoryMemberships = 0;
      do {
        const response = await fetch("/api/admin/tahoiya-catalog-migration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        const data = await response.json().catch(() => null) as { result?: MigrationResult; error?: string } | null;
        if (response.status === 401) { onAuthExpired(); return; }
        if (!response.ok || !data?.result) throw new Error(data?.error || "TAHOIYA_CATALOG_MIGRATION_FAILED");
        if (!data.result.done && data.result.nextCursor === cursor) throw new Error("TAHOIYA_CATALOG_MIGRATION_STALLED");
        cursor = data.result.nextCursor;
        totalProcessed += data.result.processed;
        totalHistoryMemberships += data.result.historyMemberships;
        setProcessed(totalProcessed);
        if (data.result.done) {
          if (data.result.status) setStatus(data.result.status);
          setMessage(`${totalProcessed.toLocaleString("ja-JP")}件を走査し、既出履歴${totalHistoryMemberships.toLocaleString("ja-JP")}件を移しました。`);
          break;
        }
      } while (true);
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      if (code === "ADMIN_AUTH_REQUIRED") onAuthExpired();
      else setMessage(errorMessage(code));
    } finally { setMigrating(false); }
  };

  const progress = status?.sourceRecordCount
    ? Math.min(100, Math.floor((processed / status.sourceRecordCount) * 100))
    : 0;
  const hasNoSourceRecords = status?.sourceRecordCount === 0;

  return <section className="mb-8 rounded-2xl border border-violet-300/20 bg-violet-300/[0.06] p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-violet-300">Preview限定・たほい屋DB移行</p><h2 className="mt-1 text-xl font-black">たほい屋のお題を共通DBへ移す</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">旧Redisのお題本体を共通DBへ移し、候補内の経験済みプレイヤー配列をプレイヤー別Redis Setへ反転します。旧Redisは削除せず、移行中も互換読み取りを続けます。</p></div><button type="button" onClick={() => void load()} disabled={loading || migrating} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold disabled:opacity-40">件数を再確認</button></div>
    {status && <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div className="rounded-xl bg-black/20 p-3"><dt className="text-slate-400">旧Redisの有効お題</dt><dd className="mt-1 text-lg font-black">{status.sourceValidCount.toLocaleString("ja-JP")}件</dd></div><div className="rounded-xl bg-black/20 p-3"><dt className="text-slate-400">共通DBのお題</dt><dd className="mt-1 text-lg font-black">{status.targetTopicCount.toLocaleString("ja-JP")}件</dd></div><div className="rounded-xl bg-black/20 p-3"><dt className="text-slate-400">移行状態</dt><dd className="mt-1 text-lg font-black">{hasNoSourceRecords ? "対象なし" : status.complete ? "完了" : "未完了"}</dd></div></dl>}
    {hasNoSourceRecords && <p role="status" className="mt-4 rounded-xl border border-violet-300/25 bg-black/20 px-4 py-3 text-sm text-violet-100">開発Redisに旧たほい屋お題はありません。移行処理は不要です。今後、管理画面で採用したお題は共通DBへ保存されます。</p>}
    {migrating && <div className="mt-4"><div className="h-2 overflow-hidden rounded-full bg-black/30" role="progressbar" aria-label="たほい屋カタログ移行の進捗" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full bg-violet-300 transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate-300">{processed.toLocaleString("ja-JP")} / {status?.sourceRecordCount.toLocaleString("ja-JP") ?? "—"}件を確認中</p></div>}
    {message && <p role="status" className="mt-4 rounded-xl border border-violet-300/25 bg-black/20 px-4 py-3 text-sm text-violet-100">{message}</p>}
    <button type="button" onClick={() => void migrate()} disabled={loading || migrating || !status || status.sourceValidCount === 0 || status.complete} className="mt-4 rounded-xl bg-violet-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40">{migrating ? "移行中…" : hasNoSourceRecords ? "移行対象なし" : status?.complete ? "移行完了" : "移行を開始"}</button>
  </section>;
}
