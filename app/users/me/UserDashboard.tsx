"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PlayerSession } from "@/lib/player-session";
import type { PlayerGameResult, PlayerStatsResponse } from "@/lib/player-stats-store";
import { GameReplayPanel } from "@/app/components/GameReplayPanel";
import { games } from "@/app/games/game-catalog";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function summaryItems(stats: PlayerStatsResponse | null) {
  return [
    ["当日", stats?.today],
    ["月間", stats?.month],
    ["通算", stats?.total],
  ] as const;
}

function gameEntry(gameType: PlayerGameResult["gameType"]) {
  return games.find((game) => game.id === gameType);
}

export function UserDashboard() {
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [stats, setStats] = useState<PlayerStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [message, setMessage] = useState("");
  const [debugAccess, setDebugAccess] = useState(false);
  const [debugPassword, setDebugPassword] = useState("");
  const [debugMessage, setDebugMessage] = useState("");
  const [debugSaving, setDebugSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const sessionResponse = await fetch("/api/player-session", { cache: "no-store", signal: controller.signal });
        if (sessionResponse.status === 401) {
          setRequiresLogin(true);
          return;
        }
        const sessionBody = (await sessionResponse.json()) as { session?: PlayerSession };
        if (!sessionResponse.ok || !sessionBody.session?.id) throw new Error("SESSION_LOAD_FAILED");
        setSession(sessionBody.session);
        const debugResponse = await fetch("/api/debug-auth", { cache: "no-store", signal: controller.signal });
        if (debugResponse.ok) {
          const debugBody = (await debugResponse.json()) as { enabled?: boolean };
          setDebugAccess(debugBody.enabled === true);
        }

        const params = new URLSearchParams({ playerId: sessionBody.session.id, gameType: "all" });
        const statsResponse = await fetch(`/api/player-stats?${params.toString()}`, { cache: "no-store", signal: controller.signal });
        const statsBody = (await statsResponse.json()) as { stats?: PlayerStatsResponse };
        if (!statsResponse.ok || !statsBody.stats) throw new Error("STATS_LOAD_FAILED");
        setStats(statsBody.stats);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setMessage("ユーザー情報を読み込めませんでした。");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const updateDebugAccess = async (enabled: boolean) => {
    if (debugSaving) return;
    setDebugSaving(true);
    setDebugMessage("");
    try {
      const response = await fetch("/api/debug-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, password: enabled ? debugPassword : "" }),
      });
      if (!response.ok) {
        setDebugMessage(response.status === 401 ? "デバッグ用パスワードが違います。" : "デバッグ利用設定を変更できませんでした。");
        return;
      }
      setDebugAccess(enabled);
      setDebugPassword("");
      setDebugMessage(enabled ? "デバッグ機能を利用できるようにしました。" : "デバッグ機能を非表示にしました。");
    } catch {
      setDebugMessage("デバッグ利用設定を変更できませんでした。");
    } finally {
      setDebugSaving(false);
    }
  };

  if (isLoading) {
    return <main className="min-h-screen bg-slate-950 px-4 py-12 text-center text-sm text-slate-300">マイページを読み込み中...</main>;
  }

  if (requiresLogin) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-12 text-white">
        <div className="mx-auto max-w-lg rounded-xl border border-white/10 bg-white/10 p-6 text-center">
          <h1 className="text-2xl font-black">ログインが必要です</h1>
          <p className="mt-2 text-sm text-slate-300">マイページは本人だけが閲覧できます。</p>
          <Link href="/games" className="mt-5 inline-flex rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950">ゲームロビーへ</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-950">
      <header className="border-b border-white/10 bg-[radial-gradient(circle_at_15%_0%,rgba(139,92,246,0.28),transparent_38%),linear-gradient(135deg,#020617,#172033)] text-white">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-white/30 text-xl font-black" style={{ backgroundColor: session?.avatarColor || "#0891b2" }} aria-hidden="true">
                {session?.name.slice(0, 1) || "?"}
              </span>
              <div>
                <p className="text-xs font-semibold uppercase text-violet-200">My page</p>
                <h1 className="text-3xl font-black">{session?.name || "プレイヤー"}</h1>
                <p className="mt-1 text-sm text-slate-300">戦績・プレイバック・お気に入り</p>
              </div>
            </div>
            <Link href="/games" className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/20">ゲームロビーへ</Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <section className="rounded-lg bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.22)]" aria-labelledby="user-stats-heading">
          <p className="text-xs font-semibold uppercase text-cyan-700">Stats</p>
          <h2 id="user-stats-heading" className="text-xl font-black text-slate-950">戦績</h2>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {summaryItems(stats).map(([label, summary]) => (
              <div key={label} className="rounded-lg bg-slate-100 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-black text-slate-950">{summary?.winRate ?? 0}%</p>
                <p className="text-[11px] text-slate-500">{summary?.wins ?? 0}勝 / {summary?.played ?? 0}戦</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {games.filter((game) => game.stats === "account").map((game) => (
              <div key={game.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="font-semibold text-slate-700">{game.title}</span>
                <span className="font-black text-cyan-700">{stats?.ratings[game.id as PlayerGameResult["gameType"]] ?? 1000}</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-black text-slate-800">最近の結果</h3>
            {stats?.recent.length ? (
              <div className="mt-2 space-y-2">
                {stats.recent.map((result) => (
                  <article key={result.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{gameEntry(result.gameType)?.title ?? result.gameType}・{result.resultLabel}</p>
                      <p className="text-xs text-slate-500">{formatDate(result.finishedAt)}</p>
                    </div>
                  </article>
                ))}
                <p className="px-1 text-xs leading-5 text-slate-500">共有は、右側のプレイバックに見どころを添えて行えます。</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">まだ戦績はありません。</p>
            )}
          </div>
          {message && <p className="mt-4 rounded-md bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800" role="status">{message}</p>}
          </section>
          <GameReplayPanel />
        </div>

        <section className="mt-8 border-t border-white/10 pt-4 text-slate-400" aria-labelledby="debug-access-heading">
          <details className="group text-xs">
            <summary id="debug-access-heading" className="w-fit cursor-pointer select-none rounded px-1 py-1 text-[11px] font-medium text-slate-500 transition hover:text-slate-300">開発者向け設定{debugAccess ? " · 有効" : ""}</summary>
            <div className="mt-2 max-w-md rounded-md border border-white/10 bg-white/[0.03] p-3">
              <p className="leading-5 text-slate-500">管理パスワードで有効にすると、各ゲームにデバッグ操作が表示されます。設定はアカウントに保存されます。</p>
              {debugAccess ? <div className="mt-3 flex items-center gap-3"><span className="text-xs text-cyan-200/70">デバッグ機能は有効です</span><button type="button" disabled={debugSaving} onClick={() => void updateDebugAccess(false)} className="rounded border border-white/15 px-2 py-1 text-[11px] text-slate-400 transition hover:text-slate-200 disabled:opacity-40">利用を解除</button></div> : <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input type="password" value={debugPassword} onChange={(event) => setDebugPassword(event.target.value)} placeholder="デバッグ用パスワード" autoComplete="off" className="min-w-0 flex-1 rounded border border-white/15 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-slate-500" /><button type="button" disabled={debugSaving || !debugPassword} onClick={() => void updateDebugAccess(true)} className="rounded border border-white/15 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-40">認証</button></div>}
              {debugMessage && <p className="mt-2 text-[11px] text-slate-500" role="status">{debugMessage}</p>}
            </div>
          </details>
        </section>
      </div>
    </main>
  );
}
