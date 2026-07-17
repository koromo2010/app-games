"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ensureSiteAdminStepUp } from "@/lib/site-admin-passkey-client";

type DebugAccessPlayer = {
  playerId: string;
  displayName: string;
  hasRecoveryEmail: boolean;
  automaticAccess: boolean;
  manualAccess: boolean;
  grantedByEmail: string | null;
  grantedAt: number | null;
};

const debugAccessMessages: Record<string, string> = {
  PLAYER_DEBUG_ACCESS_STORE_NOT_CONFIGURED: "プレイヤー保存用Postgresが設定されていません。",
  PLAYER_DEBUG_ACCESS_PLAYER_NOT_FOUND: "対象のプレイヤーが見つかりません。",
  PLAYER_DEBUG_ACCESS_LOAD_FAILED: "プレイヤー一覧を読み込めませんでした。",
  PLAYER_DEBUG_ACCESS_GRANT_FAILED: "デバッグ権限を付与できませんでした。",
  PLAYER_DEBUG_ACCESS_REVOKE_FAILED: "デバッグ権限を解除できませんでした。",
};

function messageFor(code: string | undefined, fallback: string) {
  return code ? debugAccessMessages[code] ?? fallback : fallback;
}

export function PlayerDebugAccessPanel({ onAuthExpired, recoveryMode }: { onAuthExpired: () => void; recoveryMode: boolean }) {
  const [search, setSearch] = useState("");
  const [players, setPlayers] = useState<DebugAccessPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingPlayerId, setUpdatingPlayerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/debug-access", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json().catch(() => null) as { players?: DebugAccessPlayer[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.players) throw new Error(data?.error || "PLAYER_DEBUG_ACCESS_LOAD_FAILED");
      setPlayers(data.players);
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setMessage(messageFor(error instanceof Error ? error.message : undefined, "プレイヤー一覧を読み込めませんでした。"));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [onAuthExpired]);

  const loadPlayers = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/debug-access?q=${encodeURIComponent(search)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null) as { players?: DebugAccessPlayer[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.players) throw new Error(data?.error || "PLAYER_DEBUG_ACCESS_LOAD_FAILED");
      setPlayers(data.players);
    } catch (error) {
      setMessage(messageFor(error instanceof Error ? error.message : undefined, "プレイヤー一覧を読み込めませんでした。"));
    } finally {
      setLoading(false);
    }
  };

  const updateAccess = async (player: DebugAccessPlayer) => {
    if (recoveryMode || updatingPlayerId) return;
    const revoke = player.manualAccess;
    if (revoke && !window.confirm(`${player.displayName} の個別デバッグ権限を解除しますか？`)) return;
    setUpdatingPlayerId(player.playerId);
    setMessage("");
    try {
      await ensureSiteAdminStepUp();
      const response = await fetch("/api/admin/debug-access", {
        method: revoke ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.playerId, search }),
      });
      const data = await response.json().catch(() => null) as { players?: DebugAccessPlayer[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.players) throw new Error(data?.error || (revoke ? "PLAYER_DEBUG_ACCESS_REVOKE_FAILED" : "PLAYER_DEBUG_ACCESS_GRANT_FAILED"));
      setPlayers(data.players);
      setMessage(revoke ? `${player.displayName} の個別デバッグ権限を解除しました。` : `${player.displayName} にデバッグ権限を付与しました。`);
    } catch (error) {
      setMessage(messageFor(error instanceof Error ? error.message : undefined, revoke ? "デバッグ権限を解除できませんでした。" : "デバッグ権限を付与できませんでした。"));
    } finally {
      setUpdatingPlayerId(null);
    }
  };

  return <section className="mt-8 border-t border-white/10 pt-7" aria-labelledby="player-debug-access-heading">
    <h3 id="player-debug-access-heading" className="text-lg font-black">プレイヤーへ個別にデバッグ権限を付与</h3>
    <p className="mt-1 text-sm leading-6 text-slate-400">メール未登録のプレイヤーにも付与できます。名前で検索して対象を選んでください。管理者メールとの一致による自動付与も引き続き有効です。</p>
    <form onSubmit={loadPlayers} className="mt-4 flex gap-2">
      <label className="sr-only" htmlFor="debug-player-search">プレイヤー名</label>
      <input id="debug-player-search" value={search} onChange={(event) => setSearch(event.target.value)} maxLength={80} className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/25 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20" placeholder="例：test9" />
      <button type="submit" disabled={loading} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold hover:bg-white/10 disabled:opacity-40">検索</button>
    </form>
    {loading ? <p className="mt-4 animate-pulse text-sm text-cyan-200">読み込み中…</p> : players.length === 0 ? <p className="mt-4 rounded-xl bg-black/20 px-4 py-3 text-sm text-slate-400">該当するプレイヤーはいません。</p> : <ul className="mt-4 space-y-2">
      {players.map((player) => <li key={player.playerId} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="truncate font-bold text-white">{player.displayName}</p><p className="mt-1 text-xs text-slate-400">復旧用メール：{player.hasRecoveryEmail ? "登録済み" : "未登録"}</p><p className={`mt-1 text-xs font-bold ${player.manualAccess || player.automaticAccess ? "text-emerald-300" : "text-slate-500"}`}>{player.manualAccess ? "個別付与中" : player.automaticAccess ? "管理者メール一致で自動付与中" : "デバッグ権限なし"}</p></div>
        {player.manualAccess ? <button type="button" onClick={() => void updateAccess(player)} disabled={recoveryMode || Boolean(updatingPlayerId)} className="rounded-lg border border-rose-300/30 px-3 py-2 text-sm font-bold text-rose-200 hover:bg-rose-300/10 disabled:opacity-40">{updatingPlayerId === player.playerId ? "解除中…" : "個別付与を解除"}</button> : player.automaticAccess ? <span className="rounded-lg border border-emerald-300/20 px-3 py-2 text-center text-xs font-bold text-emerald-200">自動付与</span> : <button type="button" onClick={() => void updateAccess(player)} disabled={recoveryMode || Boolean(updatingPlayerId)} className="rounded-lg bg-cyan-300 px-3 py-2 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-40">{updatingPlayerId === player.playerId ? "付与中…" : "デバッグ権限を付与"}</button>}
      </li>)}
    </ul>}
    {recoveryMode && <p className="mt-3 text-xs leading-5 text-amber-200">復旧モードでは個別権限を変更できません。管理者アカウントでログインしてください。</p>}
    {message && <p role="status" className="mt-3 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">{message}</p>}
  </section>;
}
