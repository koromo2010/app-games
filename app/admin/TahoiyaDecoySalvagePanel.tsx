"use client";

import { useCallback, useEffect, useState } from "react";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";
import type { TahoiyaDecoyCandidateStats } from "@/lib/tahoiya-decoy-candidate-store";
import type { TahoiyaDecoySalvageBatchResult } from "@/lib/tahoiya-decoy-salvage";

function errorMessage(code: string | undefined) {
  if (code === "POSTGRES_STORE_NOT_CONFIGURED") return "回答候補を保存するPostgresが設定されていません。";
  if (code === "ADMIN_STEP_UP_REQUIRED") return "パスキー確認の有効時間が切れました。もう一度実行してください。";
  return code || "回答候補の状態を確認できませんでした。";
}

export function TahoiyaDecoySalvagePanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [stats, setStats] = useState<TahoiyaDecoyCandidateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvaging, setSalvaging] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setMessage("");
    const response = await fetch("/api/admin/tahoiya-decoy-salvage", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { stats?: TahoiyaDecoyCandidateStats; error?: string } | null;
    if (response.status === 401) { onAuthExpired(); return; }
    if (!response.ok || !data?.stats) { setMessage(errorMessage(data?.error)); setLoading(false); return; }
    setStats(data.stats); setLoading(false);
  }, [onAuthExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const salvage = async () => {
    if (salvaging) return;
    if (!window.confirm("Redisに残る過去のたほい屋プレイバックと結果部屋から、名前・プレイヤーIDを含めず偽回答と得票だけを保存します。元データは削除しません。続けますか？")) return;
    setSalvaging(true); setMessage("");
    try {
      await ensureSiteAdminStepUp();
      let cursor = "replay:0";
      let scannedKeys = 0;
      let tahoiyaRounds = 0;
      let candidatesFound = 0;
      let importedEvents = 0;
      do {
        const response = await fetch("/api/admin/tahoiya-decoy-salvage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        const data = await response.json().catch(() => null) as {
          result?: TahoiyaDecoySalvageBatchResult;
          stats?: TahoiyaDecoyCandidateStats | null;
          error?: string;
        } | null;
        if (response.status === 401) { onAuthExpired(); return; }
        if (!response.ok || !data?.result) throw new Error(data?.error || "TAHOIYA_DECOY_SALVAGE_FAILED");
        if (!data.result.done && data.result.nextCursor === cursor) throw new Error("TAHOIYA_DECOY_SALVAGE_STALLED");
        cursor = data.result.nextCursor;
        scannedKeys += data.result.scannedKeys;
        tahoiyaRounds += data.result.tahoiyaRounds;
        candidatesFound += data.result.candidatesFound;
        importedEvents += data.result.importedEvents;
        if (data.result.done) {
          if (data.stats) setStats(data.stats);
          setMessage(`${scannedKeys.toLocaleString("ja-JP")}件を走査し、たほい屋${tahoiyaRounds.toLocaleString("ja-JP")}ラウンドから候補${candidatesFound.toLocaleString("ja-JP")}件を確認しました。新規取込は${importedEvents.toLocaleString("ja-JP")}件です。`);
          break;
        }
      } while (true);
    } catch (error) {
      const code = error instanceof Error ? error.message : undefined;
      if (code === "ADMIN_AUTH_REQUIRED") onAuthExpired();
      else setMessage(errorMessage(code));
    } finally {
      setSalvaging(false);
    }
  };

  return <section className="mb-8 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-amber-300">一人たほい屋（仮）・回答候補DB</p><h2 className="mt-1 text-xl font-black">過去の偽回答を匿名で残す</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">プレイバックと結果部屋から、単語・正解・偽回答・得票数だけを保存します。名前、プレイヤーID、部屋コードは候補DBへ保存せず、再実行しても票を二重加算しません。</p></div><button type="button" onClick={() => void load()} disabled={loading || salvaging} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold disabled:opacity-40">件数を再確認</button></div>
    {stats && <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6"><Stat label="単語" value={stats.wordCount} /><Stat label="候補" value={stats.candidateCount} /><Stat label="取込イベント" value={stats.eventCount} /><Stat label="たほい屋票" value={stats.multiplayerVotes} /><Stat label="一人用票" value={stats.soloVotes} /><Stat label="純粋な0票" value={stats.pureZeroCount} /></dl>}
    {message && <p role="status" className="mt-4 rounded-xl border border-amber-300/25 bg-black/20 px-4 py-3 text-sm text-amber-100">{message}</p>}
    <button type="button" onClick={() => void salvage()} disabled={loading || salvaging || !stats} className="mt-4 rounded-xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-40">{salvaging ? "サルベージ中…" : "残っている過去回答を取り込む"}</button>
  </section>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl bg-black/20 p-3"><dt className="text-slate-400">{label}</dt><dd className="mt-1 text-lg font-black">{value.toLocaleString("ja-JP")}</dd></div>;
}
