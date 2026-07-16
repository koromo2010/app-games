"use client";

import registry from "@/config/game-registry.json";
import { useCallback, useEffect, useState } from "react";
import { defaultGameOperations, gameOperationMessageMaxLength, type GameOperation, type GameOperationMode } from "@/lib/game-operations";

const modeLabels: Record<GameOperationMode, string> = { open: "公開中", maintenance: "メンテナンス", hidden: "非表示" };

export function GameOperationsPanel({ onAuthExpired }: { onAuthExpired: () => void }) {
  const [operations, setOperations] = useState<GameOperation[]>(defaultGameOperations());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/game-operations", { cache: "no-store" });
      const data = await response.json().catch(() => null) as { operations?: GameOperation[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.operations) throw new Error(data?.error || "LOAD_FAILED");
      setOperations(data.operations); setMessage("");
    } catch { setMessage("ゲームの公開状態を読み込めませんでした。"); }
    finally { setIsLoading(false); }
  }, [onAuthExpired]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const change = (gameId: string, patch: Partial<GameOperation>) => setOperations((current) => current.map((operation) => operation.gameId === gameId ? { ...operation, ...patch } : operation));

  const save = async () => {
    if (isSaving) return;
    if (operations.some((operation) => operation.mode !== "open") && !window.confirm("メンテナンス・非表示にしたゲームは、プレイ中の参加者も次の通信から操作できなくなります。保存しますか？")) return;
    setIsSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/game-operations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operations }) });
      const data = await response.json().catch(() => null) as { operations?: GameOperation[]; error?: string } | null;
      if (response.status === 401) { onAuthExpired(); return; }
      if (!response.ok || !data?.operations) throw new Error(data?.error || "SAVE_FAILED");
      setOperations(data.operations); setMessage("ゲームの公開状態を保存しました。反映には最大15秒ほどかかります。");
    } catch { setMessage("ゲームの公開状態を保存できませんでした。"); }
    finally { setIsSaving(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-8"><div><h2 className="text-2xl font-black">ゲーム公開管理</h2><p className="mt-1 text-sm leading-6 text-slate-400">公開中・メンテナンス・非表示を切り替えます。変更前にプレイ中の部屋がないか、ダッシュボードで確認してください。</p></div>{message && <p role="status" className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-50">{message}</p>}{isLoading ? <p className="py-12 text-center text-sm text-cyan-200 animate-pulse">公開状態を読み込み中…</p> : <div className="space-y-3">{registry.map((game) => {
    const operation = operations.find((item) => item.gameId === game.id) ?? { gameId: game.id, mode: "open" as const, message: "", updatedAt: null };
    return <section key={game.id} className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 md:grid-cols-[minmax(180px,1fr)_210px_2fr]"><div><h3 className="font-black">{game.title}</h3><p className="mt-1 font-mono text-xs text-slate-500">{game.id}</p></div><label className="text-sm font-bold text-slate-300">公開状態<select value={operation.mode} onChange={(event) => change(game.id, { mode: event.target.value as GameOperationMode })} className="mt-2 w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2.5 text-white"><option value="open">公開中</option><option value="maintenance">メンテナンス</option><option value="hidden">非表示</option></select><span className={`mt-2 inline-block text-xs ${operation.mode === "open" ? "text-emerald-300" : operation.mode === "maintenance" ? "text-amber-300" : "text-slate-400"}`}>{modeLabels[operation.mode]}</span></label><label className="text-sm font-bold text-slate-300">利用者への案内<input value={operation.message} maxLength={gameOperationMessageMaxLength} disabled={operation.mode === "open"} onChange={(event) => change(game.id, { message: event.target.value })} placeholder="例：更新作業中です。22時ごろ再開予定です。" className="mt-2 w-full rounded-lg border border-white/15 bg-black/25 px-3 py-2.5 text-white disabled:opacity-40" /><span className="mt-1 block text-right text-xs font-normal text-slate-500">{operation.message.length}/{gameOperationMessageMaxLength}</span></label></section>;
  })}</div>}<div className="sticky bottom-3 flex justify-end"><button type="button" disabled={isLoading || isSaving} onClick={() => void save()} className="rounded-xl bg-amber-300 px-6 py-3 font-black text-slate-950 shadow-xl hover:bg-amber-200 disabled:opacity-40">{isSaving ? "保存中…" : "公開状態を保存"}</button></div></div>;
}
