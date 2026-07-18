"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import type { LegacyVocabularyImportStatus } from "@/lib/vocabulary-legacy-import";

type LegacyImportBatchResult = {
  processed: number;
  imported: number;
  nextCursor: number;
  done: boolean;
  status: LegacyVocabularyImportStatus | null;
};

type LegacyImportCheckpoint = {
  cursor: number;
  processed: number;
  sourceActiveCount: number;
};

const legacyImportCheckpointKey = "game-fields:vocabulary-legacy-import:v1";

function importErrorMessage(code: string | undefined) {
  if (code === "LEGACY_VOCABULARY_CATALOG_NOT_FOUND") return "現在の開発DBに旧単語カタログがありません。Previewへ旧カタログ読取URLを設定してください。";
  if (code === "LEGACY_VOCABULARY_IMPORT_PREVIEW_ONLY") return "この取込はdevelop Previewだけで実行できます。";
  if (code === "LEGACY_VOCABULARY_SOURCE_NOT_CONFIGURED") return "開発DBの接続設定がありません。";
  if (code === "VOCABULARY_ADMIN_STORE_NOT_CONFIGURED") return "共通単語DBの管理接続がありません。";
  if (code === "ADMIN_STEP_UP_REQUIRED") return "パスキー確認の有効時間が切れました。もう一度「取込を開始」を押してください。";
  return code || "旧単語カタログを確認できませんでした。";
}

export function LegacyVocabularyImportPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [status, setStatus] = useState<LegacyVocabularyImportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [message, setMessage] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch("/api/admin/vocabulary-import", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { status?: LegacyVocabularyImportStatus; error?: string } | null;
    if (response.status === 401) { onAuthExpired(); return; }
    if (!response.ok || !data?.status) { setMessage(importErrorMessage(data?.error)); setLoading(false); return; }
    setStatus(data.status); setLoading(false);
  }, [onAuthExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  const runImport = async () => {
    if (!status || importing || status.complete) return;
    if (!window.confirm(`${status.sourceActiveCount.toLocaleString("ja-JP")}語を共通単語DBへ取り込みます。続けますか？`)) return;
    setImporting(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      let checkpoint: LegacyImportCheckpoint | null = null;
      try {
        checkpoint = JSON.parse(window.localStorage.getItem(legacyImportCheckpointKey) || "null") as LegacyImportCheckpoint | null;
      } catch { checkpoint = null; }
      if (!checkpoint || checkpoint.sourceActiveCount !== status.sourceActiveCount) {
        checkpoint = { cursor: 0, processed: 0, sourceActiveCount: status.sourceActiveCount };
      }
      let cursor = checkpoint.cursor;
      let totalProcessed = checkpoint.processed;
      setProcessed(totalProcessed);

      while (true) {
        const response = await fetch("/api/admin/vocabulary-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ afterId: cursor }),
        });
        const data = await response.json().catch(() => null) as { result?: LegacyImportBatchResult; error?: string } | null;
        if (response.status === 401) { onAuthExpired(); return; }
        if (!response.ok || !data?.result) throw new Error(data?.error || "LEGACY_VOCABULARY_IMPORT_FAILED");
        if (!data.result.done && data.result.nextCursor <= cursor) throw new Error("LEGACY_VOCABULARY_IMPORT_STALLED");
        cursor = data.result.nextCursor;
        totalProcessed += data.result.processed;
        setProcessed(totalProcessed);
        window.localStorage.setItem(legacyImportCheckpointKey, JSON.stringify({
          cursor,
          processed: totalProcessed,
          sourceActiveCount: status.sourceActiveCount,
        }));
        if (data.result.done) {
          window.localStorage.removeItem(legacyImportCheckpointKey);
          if (data.result.status) setStatus(data.result.status);
          setMessage(`${totalProcessed.toLocaleString("ja-JP")}語の走査が完了しました。`);
          break;
        }
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      if (code === "ADMIN_AUTH_REQUIRED") onAuthExpired();
      else setMessage(importErrorMessage(code));
    } finally { setImporting(false); }
  };

  const progress = status?.sourceActiveCount
    ? Math.min(100, Math.floor((processed / status.sourceActiveCount) * 100))
    : 0;

  return <section className="mb-8 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-amber-300">Preview限定・初回移行</p><h2 className="mt-1 text-xl font-black">旧単語カタログを共通DBへ取り込む</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">旧DBの審査済み単語だけを読み取り、共通単語DBのワードウルフ候補へ追加します。旧DBの内容は変更しません。途中で止まっても同じボタンから再開できます。</p></div><button type="button" onClick={() => void loadStatus()} disabled={loading || importing} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold disabled:opacity-40">件数を再確認</button></div>
    {status && <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-xl bg-black/20 p-3"><dt className="text-slate-400">旧DBの対象</dt><dd className="mt-1 text-lg font-black">{status.sourceActiveCount.toLocaleString("ja-JP")}語</dd></div><div className="rounded-xl bg-black/20 p-3"><dt className="text-slate-400">正規化後の取込対象</dt><dd className="mt-1 text-lg font-black">{status.sourceUniqueCount.toLocaleString("ja-JP")}語</dd></div><div className="rounded-xl bg-black/20 p-3"><dt className="text-slate-400">共通DBの有効単語</dt><dd className="mt-1 text-lg font-black">{status.targetActiveWordCount.toLocaleString("ja-JP")}語</dd></div><div className="rounded-xl bg-black/20 p-3"><dt className="text-slate-400">ワードウルフ候補</dt><dd className="mt-1 text-lg font-black">{status.targetWordwolfEligibleCount.toLocaleString("ja-JP")}語</dd></div></dl>}
    {importing && <div className="mt-4"><div className="h-2 overflow-hidden rounded-full bg-black/30" role="progressbar" aria-label="単語取込の進捗" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-slate-300">{processed.toLocaleString("ja-JP")} / {status?.sourceActiveCount.toLocaleString("ja-JP") ?? "—"}語を確認中（{progress}%）</p></div>}
    {message && <p role="status" className="mt-4 rounded-xl border border-amber-300/25 bg-black/20 px-4 py-3 text-sm text-amber-100">{message}</p>}
    <button type="button" onClick={() => void runImport()} disabled={loading || importing || !status || status.sourceActiveCount === 0 || status.complete} className="mt-4 rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40">{importing ? "取り込み中…この画面を閉じないでください" : status?.complete ? "取り込み完了" : "取込を開始"}</button>
  </section>;
}
