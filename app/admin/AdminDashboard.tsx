"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminDashboardSnapshot } from "@/lib/admin-dashboard";
import { webVitalThresholds, type WebVitalName } from "@/lib/web-vitals";

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(timestamp));
}

function vitalLabel(name: WebVitalName) {
  return name === "LCP" ? "表示速度" : name === "INP" ? "操作の反応" : "表示のズレ";
}

function vitalValue(name: WebVitalName, value: number | null) {
  if (value === null) return "―";
  return name === "CLS" ? value.toFixed(3) : `${Math.round(value)}ms`;
}

function vitalColor(name: WebVitalName, value: number | null) {
  if (value === null) return "text-slate-400";
  const threshold = webVitalThresholds[name];
  if (value <= threshold.good) return "text-emerald-300";
  if (value <= threshold.poor) return "text-amber-300";
  return "text-rose-300";
}

export function AdminDashboard({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [dashboard, setDashboard] = useState<AdminDashboardSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
      const data = await response.json().catch(() => null) as { dashboard?: AdminDashboardSnapshot; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.dashboard) throw new Error(data?.error || "LOAD_FAILED");
      setDashboard(data.dashboard); setMessage("");
    } catch {
      setMessage("稼働状況を読み込めませんでした。少し待ってから更新してください。");
    } finally {
      setIsLoading(false);
    }
  }, [onAuthExpired]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  if (isLoading && !dashboard) return <div className="mx-auto max-w-6xl px-4 py-12 text-center text-sm font-bold text-cyan-200 animate-pulse">稼働状況を集計中…</div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-2xl font-black">運営ダッシュボード</h2><p className="mt-1 text-sm text-slate-400">個人情報やゲームの秘密内容を含まない集計です。15秒ごとに更新します。</p></div>
        <button type="button" onClick={() => void refresh()} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-bold hover:bg-white/10">今すぐ更新</button>
      </div>
      {message && <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">{message}</p>}
      {dashboard && <>
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="オンライン人数" value={dashboard.onlinePlayers} note="有効な部屋の重複を除いた人数" />
          <MetricCard label="稼働中の部屋" value={dashboard.rooms.playing} note={`待機 ${dashboard.rooms.waiting}・結果 ${dashboard.rooms.finished}`} />
          <MetricCard label="直近24時間のエラー" value={dashboard.issues.errors24h} note={`警告 ${dashboard.issues.warnings24h}件`} danger={dashboard.issues.errors24h > 0} />
          <MetricCard label="集計API応答" value={`${dashboard.responseTimeMs}ms`} note={`更新 ${formatTime(dashboard.generatedAt)}`} danger={dashboard.responseTimeMs > 2_000} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <h3 className="text-lg font-black">サービス状態</h3>
            <div className="mt-4 space-y-3 text-sm">
              <StatusRow label="Redis" healthy={dashboard.services.redis === "healthy"} value={dashboard.services.redis === "healthy" ? "正常" : dashboard.services.redis === "not-configured" ? "未設定" : "接続できません"} />
              <StatusRow label="部屋の画面更新" healthy={dashboard.services.roomUpdates === "healthy"} value={dashboard.services.roomUpdates === "healthy" ? "HTTPポーリング正常" : "Redisの状態を確認"} />
              <StatusRow label="本番環境" healthy={dashboard.deployment.environment === "production"} value={`${dashboard.deployment.environment}${dashboard.deployment.region ? ` / ${dashboard.deployment.region}` : ""}`} />
            </div>
            <p className="mt-4 break-all rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-slate-400">commit {dashboard.deployment.commit || "local"}</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]">
            <div className="px-5 pt-5"><h3 className="text-lg font-black">ゲーム別の稼働状況</h3></div>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-white/[0.05] text-xs text-slate-400"><tr><th className="px-5 py-3">ゲーム</th><th className="px-3 py-3">人数</th><th className="px-3 py-3">待機</th><th className="px-3 py-3">プレイ中</th><th className="px-3 py-3">結果</th></tr></thead><tbody>{dashboard.games.map((game) => <tr key={game.gameId} className="border-t border-white/10"><td className="px-5 py-3 font-bold">{game.title}</td><td className="px-3 py-3">{game.playerCount}</td><td className="px-3 py-3">{game.waitingRooms}</td><td className="px-3 py-3 text-cyan-200">{game.playingRooms}</td><td className="px-3 py-3">{game.finishedRooms}</td></tr>)}</tbody></table></div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-lg font-black">Core Web Vitals</h3><p className="mt-1 text-sm text-slate-400">直近24時間の実利用データをp75で評価します。</p></div><p className="text-xs text-slate-500">サンプル {dashboard.webVitals.sampleCount24h}件</p></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">{dashboard.webVitals.summaries.map((vital) => {
            const total = Math.max(1, vital.count);
            return <article key={vital.name} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-mono text-xs font-bold text-cyan-300">{vital.name}</p><h4 className="font-bold">{vitalLabel(vital.name)}</h4></div><p className={`text-2xl font-black ${vitalColor(vital.name, vital.p75)}`}>{vitalValue(vital.name, vital.p75)}</p></div><div className="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-800"><span className="bg-emerald-400" style={{ width: `${vital.ratings.good / total * 100}%` }} /><span className="bg-amber-400" style={{ width: `${vital.ratings["needs-improvement"] / total * 100}%` }} /><span className="bg-rose-400" style={{ width: `${vital.ratings.poor / total * 100}%` }} /></div><div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>良好 {vital.ratings.good}</span><span>要改善 {vital.ratings["needs-improvement"]}</span><span>不良 {vital.ratings.poor}</span></div><p className="mt-3 text-xs text-slate-500">スマホ {vital.devices.mobile} / PC {vital.devices.desktop}</p></article>;
          })}</div>
          {dashboard.webVitals.sampleCount24h === 0 && <p className="mt-4 rounded-lg bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">公開後に利用データが届くと、ここへメーターが表示されます。</p>}
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
          <h3 className="text-lg font-black">最近の警告・エラー</h3><p className="mt-1 text-sm text-slate-400">自由記述、部屋コード、プレイヤー名などは保存しません。</p>
          {dashboard.issues.recent.length ? <div className="mt-4 space-y-2">{dashboard.issues.recent.map((issue) => <div key={issue.id} className="grid gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm sm:grid-cols-[90px_1fr_auto]"><span className={`w-fit rounded-md px-2 py-1 text-xs font-black ${issue.level === "error" ? "bg-rose-300 text-rose-950" : "bg-amber-300 text-amber-950"}`}>{issue.level.toUpperCase()}</span><div><p className="font-bold">{issue.errorCode || issue.event}</p><p className="mt-1 break-all font-mono text-xs text-slate-500">{[issue.game, issue.operation, issue.route].filter(Boolean).join(" / ") || "site"}</p></div><time className="text-xs text-slate-500">{formatTime(issue.occurredAt)}</time></div>)}</div> : <p className="mt-4 rounded-lg bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100">保存されている警告・エラーはありません。</p>}
        </section>
      </>}
    </div>
  );
}

function MetricCard({ label, value, note, danger = false }: { label: string; value: string | number; note: string; danger?: boolean }) {
  return <article className={`rounded-2xl border p-4 ${danger ? "border-rose-300/30 bg-rose-300/10" : "border-white/10 bg-white/[0.05]"}`}><p className="text-xs font-bold text-slate-400">{label}</p><p className={`mt-2 text-3xl font-black ${danger ? "text-rose-200" : "text-white"}`}>{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{note}</p></article>;
}

function StatusRow({ label, healthy, value }: { label: string; healthy: boolean; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-slate-300">{label}</span><span className={`inline-flex items-center gap-2 font-bold ${healthy ? "text-emerald-300" : "text-amber-300"}`}><span className={`h-2.5 w-2.5 rounded-full ${healthy ? "bg-emerald-400" : "bg-amber-400"}`} />{value}</span></div>;
}
