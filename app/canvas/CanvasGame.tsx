"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DrawingCanvas } from "@/app/components/DrawingCanvas";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { normalizeDrawingStrokes, type DrawingStroke } from "@/lib/drawing-canvas";
import { fallbackAvatarColor, readPlayerSession, type PlayerSession } from "@/lib/player-session";

const storageKey = "canvas-prototype-board";
const channelName = "game-fields-canvas-prototype";
const colors = ["#0f172a", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

export function CanvasGame() {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(6);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [syncNotice, setSyncNotice] = useState("この端末に自動保存します");
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSession(readPlayerSession());
      try { setStrokes(normalizeDrawingStrokes(JSON.parse(localStorage.getItem(storageKey) || "[]"))); } catch { setStrokes([]); }
    }, 0);
    if (!("BroadcastChannel" in window)) return () => window.clearTimeout(timer);
    const channel = new BroadcastChannel(channelName);
    channel.onmessage = (event) => { setStrokes(normalizeDrawingStrokes(event.data)); setSyncNotice("別タブの描画を反映しました"); };
    channelRef.current = channel;
    return () => { window.clearTimeout(timer); channel.close(); };
  }, []);

  const updateStrokes = (next: DrawingStroke[]) => {
    const normalized = normalizeDrawingStrokes(next);
    setStrokes(normalized);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    channelRef.current?.postMessage(normalized);
    setSyncNotice("保存済み・別タブへ同期済み");
  };

  return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#f8fafc_42%,#fef3c7_100%)] text-slate-900 ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="PRIVATE UI PROTOTYPE" title="キャンバス">
      <Link href="/games" className={gameTopBannerActionClass}>ゲームロビー</Link>
      <GameTopMenu>
        <button type="button" data-menu-close="true" className={gameTopMenuItemClass} onClick={() => setRulesOpen(true)}>ルール・使い方 <span>›</span></button>
        <button type="button" data-menu-close="true" className={gameTopMenuItemClass} onClick={() => updateStrokes([])}>新しいキャンバス <span>↻</span></button>
      </GameTopMenu>
      <GamePlayerMenu id={session?.id} name={session?.name || "ゲスト"} avatarColor={session?.avatarColor || fallbackAvatarColor} avatarImage={session?.avatarImage} />
    </GameTopBanner>

    <section className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-5 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-300/40 backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1" aria-label="描画ツール">
            <button type="button" aria-pressed={tool === "pen"} onClick={() => setTool("pen")} className={`rounded-lg px-4 py-2 text-sm font-black ${tool === "pen" ? "bg-slate-900 text-white" : "text-slate-600"}`}>ペン</button>
            <button type="button" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} className={`rounded-lg px-4 py-2 text-sm font-black ${tool === "eraser" ? "bg-slate-900 text-white" : "text-slate-600"}`}>消しゴム</button>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="ペンの色">
            {colors.map((option) => <button key={option} type="button" aria-label={`色 ${option}`} aria-pressed={color === option} onClick={() => { setColor(option); setTool("pen"); }} className={`h-8 w-8 rounded-full border-2 ${color === option && tool === "pen" ? "border-slate-900 ring-2 ring-cyan-300" : "border-white"}`} style={{ backgroundColor: option }} />)}
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">太さ <input type="range" min="1" max="40" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-28 accent-slate-900" /><span className="w-8 text-right tabular-nums">{width}</span></label>
          <div className="ml-auto flex gap-2">
            <button type="button" disabled={strokes.length === 0} onClick={() => updateStrokes(strokes.slice(0, -1))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">一手戻す</button>
            <button type="button" disabled={strokes.length === 0} onClick={() => { if (window.confirm("キャンバスをすべて消しますか？")) updateStrokes([]); }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-40">全消去</button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border-4 border-white bg-white shadow-2xl shadow-slate-400/40">
        <div className="aspect-[4/3] min-h-[320px] max-h-[72vh] w-full"><DrawingCanvas strokes={strokes} color={color} width={width} tool={tool} onStrokeComplete={(stroke) => updateStrokes([...strokes, stroke])} /></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-semibold text-slate-500"><span>{syncNotice}</span><span>{strokes.length}ストローク・同じブラウザの別タブで同期テスト可能</span></div>
    </section>

    <GameRulesDialog open={rulesOpen} title="キャンバスの使い方" onClose={() => setRulesOpen(false)}>
      <p>ペンまたは消しゴムを選び、マウス・指・ペンで自由に描きます。色と線の太さはいつでも変更できます。</p>
      <p className="mt-3">「一手戻す」は最後の線を取り消し、「全消去」は白紙に戻します。描画は端末内へ自動保存されます。</p>
      <p className="mt-3">現段階は描画UIのテスト版です。同じブラウザでこのページを2つ開くと、別タブへの同期を確認できます。得点・終了条件・時間切れはまだありません。</p>
    </GameRulesDialog>
  </main>;
}
