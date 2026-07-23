"use client";

import { AppLink as Link } from "@/app/components/AppLink";
import { useCallback, useEffect, useState } from "react";
import { useOnlineRoomPolling, onlineRoomPollingIntervals } from "@/app/hooks/use-online-room-polling";
import { GameTopBanner } from "@/app/components/GameTopBanner";
import type { OnlineRoomRealtimeGame } from "@/lib/online-room-realtime-protocol";
import type { OnlineRoomSpectatorAccess, OnlineRoomSpectatorSnapshot } from "@/lib/online-room-spectator";

type SpectatorResponse = { snapshot: OnlineRoomSpectatorSnapshot; access: OnlineRoomSpectatorAccess };

async function responseJson(response: Response) {
  const data = await response.json().catch(() => null) as SpectatorResponse & { error?: string } | null;
  if (!response.ok || !data?.snapshot) throw Object.assign(new Error(data?.error || "観戦情報を取得できませんでした。"), { status: response.status });
  return data;
}

export function SpectatorRoomClient({ game, code }: { game: OnlineRoomRealtimeGame; code: string }) {
  const [data, setData] = useState<SpectatorResponse | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [message, setMessage] = useState("観戦情報を確認中…");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/online-room-spectators?game=${encodeURIComponent(game)}&code=${encodeURIComponent(code)}`, { cache: "no-store" });
    return responseJson(response);
  }, [code, game]);

  useEffect(() => {
    let active = true;
    void load().then((next) => {
      if (!active) return;
      setData(next); setMessage("");
    }).catch((error: Error & { status?: number }) => {
      if (!active) return;
      setMessage(error.status === 401 ? "観戦にはログインが必要です。" : error.status === 403 ? "観戦を開始してください。" : error.message);
    });
    return () => { active = false; };
  }, [load]);

  useOnlineRoomPolling({
    game,
    roomCode: data ? code : null,
    intervalMs: onlineRoomPollingIntervals.active,
    fetchRoom: async () => (await load()).snapshot,
    onRoom: (snapshot) => setData((current) => current ? { ...current, snapshot } : current),
    onMissing: () => { setData(null); setMessage("部屋が解散されました。"); },
    onError: (error) => {
      if (error && typeof error === "object" && "status" in error && error.status === 403) {
        setData(null);
        setMessage("ホストが観戦を停止しました。");
      }
    },
  });

  const begin = async () => {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/online-room-spectators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, code, passphrase }) });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error === "Bad passphrase" ? "合言葉が違います。" : result?.error || "観戦を開始できませんでした。");
      setData(await load()); setPassphrase(""); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "観戦を開始できませんでした。"); }
    finally { setLoading(false); }
  };

  const setEnabled = async (enabled: boolean) => {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/online-room-spectators", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, code, enabled }) });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error || "観戦設定を変更できませんでした。");
      setData(await load());
    } catch (error) { setMessage(error instanceof Error ? error.message : "観戦設定を変更できませんでした。"); }
    finally { setLoading(false); }
  };

  return <main className="min-h-screen bg-slate-950 text-white">
    <GameTopBanner eyebrow="SPECTATOR MODE" title={data?.snapshot.gameTitle ?? "観戦モード"}><Link href="/games" className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-bold">広場へ戻る</Link></GameTopBanner>
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-4"><p className="font-black text-cyan-100">観戦中の情報は公開済みの進行状況だけです</p><p className="mt-1 text-sm text-cyan-50/70">秘密語、役職、手札、暗号、投票先、チーム内相談は結果公開まで配信しません。</p></div>
      {message && <p role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 font-bold text-amber-100">{message}</p>}
      {!data && <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-xl font-black">部屋 #{code} を観戦</h2><label className="mt-4 block text-sm font-bold">合言葉（設定されている場合）<input value={passphrase} onChange={(event) => setPassphrase(event.target.value)} type="password" maxLength={40} className="mt-2 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-white" /></label><button type="button" disabled={loading} onClick={() => void begin()} className="mt-4 w-full rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50">{loading ? "確認中…" : "観戦を開始"}</button></section>}
      {data && <>
        {data.access.canManage && <section className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black text-amber-100">ホスト用観戦設定</p><p className="text-sm text-amber-50/70">現在：{data.access.enabled ? "観戦を許可" : "観戦を禁止"}</p></div><button type="button" disabled={loading} onClick={() => void setEnabled(!data.access.enabled)} className="rounded-xl bg-amber-300 px-4 py-2 font-black text-amber-950 disabled:opacity-50">{data.access.enabled ? "観戦を禁止" : "観戦を許可"}</button></div>{data.access.enabled && <button type="button" onClick={() => void navigator.clipboard.writeText(window.location.href)} className="mt-3 text-sm font-bold underline">この観戦URLをコピー</button>}</section>}
        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-black tracking-widest text-cyan-300">ROOM #{data.snapshot.code}</p><h1 className="mt-1 text-2xl font-black">{data.snapshot.phaseLabel}</h1></div><p className="text-xs text-slate-500">revision {data.snapshot.revision}</p></div><dl className="mt-4 grid gap-2 sm:grid-cols-2">{data.snapshot.facts.map((fact) => <div key={fact.label} className="rounded-xl bg-black/25 p-3"><dt className="text-xs text-slate-400">{fact.label}</dt><dd className="mt-1 font-black">{fact.value}</dd></div>)}</dl></section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><h2 className="text-lg font-black">参加者</h2><ul className="mt-3 grid gap-2 sm:grid-cols-2">{data.snapshot.players.map((player) => <li key={player.seatId} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-2"><span className="font-black">{player.label}{player.isHost ? "（ホスト）" : ""}</span>{player.metric && <span className="text-sm font-bold text-cyan-200">{player.metric}</span>}</div>{player.status && <p className="mt-1 text-sm text-amber-200">{player.status}</p>}</li>)}</ul></section>
      </>}
    </div>
  </main>;
}
