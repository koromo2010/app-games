"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingCanvas } from "@/app/components/DrawingCanvas";
import { GamePlayerMenu } from "@/app/components/GamePlayerMenu";
import { GameRulesDialog } from "@/app/components/GameRulesDialog";
import { GameTopBanner, gameTopBannerOffsetClass } from "@/app/components/GameTopBanner";
import { GameTopMenu, gameTopBannerActionClass, gameTopMenuItemClass } from "@/app/components/GameTopMenu";
import { clampDrawingPoint, normalizeDrawingStrokes, type DrawingPoint, type DrawingStroke } from "@/lib/drawing-canvas";
import { fallbackAvatarColor, readPlayerSession, type PlayerSession } from "@/lib/player-session";

const storageKey = "canvas-prototype-board";
const channelName = "game-fields-canvas-prototype";
const colors = ["#0f172a", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

export function CanvasGame() {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<DrawingStroke[]>([]);
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(6);
  const [opacity, setOpacity] = useState(1);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [syncNotice, setSyncNotice] = useState("この端末に自動保存します");
  const [keyboardCursor, setKeyboardCursor] = useState<DrawingPoint>({ x: 0.5, y: 0.5 });
  const channelRef = useRef<BroadcastChannel | null>(null);
  const spacePressedRef = useRef(false);
  const keyboardStrokeIdRef = useRef<string | null>(null);

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

  const updateStrokes = useCallback((next: DrawingStroke[]) => {
    const normalized = normalizeDrawingStrokes(next);
    setStrokes(normalized);
    localStorage.setItem(storageKey, JSON.stringify(normalized));
    channelRef.current?.postMessage(normalized);
    setSyncNotice("保存済み・別タブへ同期済み");
  }, []);

  const undo = useCallback(() => {
    setStrokes((current) => {
      const removed = current.at(-1);
      if (!removed) return current;
      const next = current.slice(0, -1);
      setRedoStrokes((redo) => [...redo, removed]);
      localStorage.setItem(storageKey, JSON.stringify(next));
      channelRef.current?.postMessage(next);
      setSyncNotice("一手戻しました");
      return next;
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStrokes((currentRedo) => {
      const restored = currentRedo.at(-1);
      if (!restored) return currentRedo;
      setStrokes((current) => {
        const next = normalizeDrawingStrokes([...current, restored]);
        localStorage.setItem(storageKey, JSON.stringify(next));
        channelRef.current?.postMessage(next);
        return next;
      });
      setSyncNotice("戻した操作をやり直しました");
      return currentRedo.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const editableTarget = (event: KeyboardEvent) => (event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || editableTarget(event)) return;
      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        if (!spacePressedRef.current) {
          const id = crypto.randomUUID();
          keyboardStrokeIdRef.current = id;
          setStrokes((current) => {
            const next = normalizeDrawingStrokes([...current, { id, color, width, opacity, tool, points: [keyboardCursor] }]);
            localStorage.setItem(storageKey, JSON.stringify(next));
            channelRef.current?.postMessage(next);
            return next;
          });
          setRedoStrokes([]);
        }
        spacePressedRef.current = true;
        event.preventDefault();
        return;
      }
      if (!event.repeat && key === "a") setTool("pen");
      else if (!event.repeat && key === "s") setTool("eraser");
      else if (key === "c") setWidth((current) => Math.max(1, current - 1));
      else if (key === "v") setWidth((current) => Math.min(40, current + 1));
      else if (!event.repeat && key === "z") undo();
      else if (!event.repeat && key === "y") redo();
      else if (event.key.startsWith("Arrow")) {
        const distance = event.shiftKey ? 0.04 : 0.012;
        setKeyboardCursor((current) => {
          const next = clampDrawingPoint({
            x: current.x + (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0),
            y: current.y + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0),
          });
          if (spacePressedRef.current && (next.x !== current.x || next.y !== current.y)) {
            setStrokes((currentStrokes) => {
              const activeId = keyboardStrokeIdRef.current;
              const nextStrokes = activeId
                ? currentStrokes.map((stroke) => stroke.id === activeId ? { ...stroke, points: [...stroke.points, next] } : stroke)
                : currentStrokes;
              const normalized = normalizeDrawingStrokes(nextStrokes);
              localStorage.setItem(storageKey, JSON.stringify(normalized));
              channelRef.current?.postMessage(normalized);
              return normalized;
            });
            setRedoStrokes([]);
            setSyncNotice("キーボード描画を保存しました");
          }
          return next;
        });
      } else return;
      event.preventDefault();
    };
    const releaseSpace = () => { spacePressedRef.current = false; keyboardStrokeIdRef.current = null; };
    const onKeyUp = (event: KeyboardEvent) => { if (event.code === "Space") releaseSpace(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseSpace);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", releaseSpace); };
  }, [color, keyboardCursor, opacity, redo, tool, undo, width]);

  return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#f8fafc_42%,#fef3c7_100%)] text-slate-900 ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="PRIVATE UI PROTOTYPE" title="キャンバス">
      <Link href="/games" className={gameTopBannerActionClass}>ゲームロビー</Link>
      <GameTopMenu>
        <button type="button" data-menu-close="true" className={gameTopMenuItemClass} onClick={() => setRulesOpen(true)}>ルール・使い方 <span>›</span></button>
        <button type="button" data-menu-close="true" className={gameTopMenuItemClass} onClick={() => { updateStrokes([]); setRedoStrokes([]); }}>新しいキャンバス <span>↻</span></button>
      </GameTopMenu>
      <GamePlayerMenu id={session?.id} name={session?.name || "ゲスト"} avatarColor={session?.avatarColor || fallbackAvatarColor} avatarImage={session?.avatarImage} />
    </GameTopBanner>

    <section className="mx-auto flex max-w-6xl flex-col gap-4 px-3 py-5 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-300/40 backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1" aria-label="描画ツール">
            <button type="button" aria-pressed={tool === "pen"} onClick={() => setTool("pen")} className={`rounded-lg px-4 py-2 text-sm font-black ${tool === "pen" ? "bg-slate-900 text-white" : "text-slate-600"}`}>ペン <kbd className="ml-1 opacity-60">A</kbd></button>
            <button type="button" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} className={`rounded-lg px-4 py-2 text-sm font-black ${tool === "eraser" ? "bg-slate-900 text-white" : "text-slate-600"}`}>消しゴム <kbd className="ml-1 opacity-60">S</kbd></button>
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label="ペンの色">
            {colors.map((option) => <button key={option} type="button" aria-label={`色 ${option}`} aria-pressed={color === option} onClick={() => { setColor(option); setTool("pen"); }} className={`h-8 w-8 rounded-full border-2 ${color === option && tool === "pen" ? "border-slate-900 ring-2 ring-cyan-300" : "border-white"}`} style={{ backgroundColor: option }} />)}
            <label className="relative grid h-8 w-8 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-white bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)] shadow-sm" title="好きな色を選ぶ">
              <span className="h-3 w-3 rounded-full border border-white bg-white" aria-hidden="true" />
              <input type="color" value={color} aria-label="カラーパレットから好きな色を選ぶ" onChange={(event) => { setColor(event.target.value); setTool("pen"); }} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">太さ <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">C</kbd><input type="range" min="1" max="40" value={width} onChange={(event) => setWidth(Number(event.target.value))} className="w-28 accent-slate-900" /><kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">V</kbd><span className="w-8 text-right tabular-nums">{width}</span></label>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-600">透明度 <input type="range" min="10" max="100" step="5" value={Math.round(opacity * 100)} onChange={(event) => setOpacity(Number(event.target.value) / 100)} className="w-24 accent-cyan-600" /><span className="w-10 text-right tabular-nums">{Math.round(opacity * 100)}%</span></label>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setShortcutsOpen(true)} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800">⌨ ショートカット</button>
            <button type="button" disabled={strokes.length === 0} onClick={undo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">一手戻す <kbd className="opacity-50">Z</kbd></button>
            <button type="button" disabled={redoStrokes.length === 0} onClick={redo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">やり直す <kbd className="opacity-50">Y</kbd></button>
            <button type="button" disabled={strokes.length === 0} onClick={() => { if (window.confirm("キャンバスをすべて消しますか？")) { updateStrokes([]); setRedoStrokes([]); } }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-40">全消去</button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border-4 border-white bg-white shadow-2xl shadow-slate-400/40">
        <div className="aspect-[4/3] min-h-[320px] max-h-[72vh] w-full"><DrawingCanvas strokes={strokes} color={color} width={width} opacity={opacity} tool={tool} keyboardCursor={keyboardCursor} onStrokeComplete={(stroke) => { updateStrokes([...strokes, stroke]); setRedoStrokes([]); }} /></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-semibold text-slate-500"><span>{syncNotice}</span><span>A ペン・S 消しゴム・C 細く・V 太く・Z 戻す・Y やり直す</span><span>矢印 移動・Space＋矢印 描画・Shift 高速</span><span>{strokes.length}ストローク</span></div>
    </section>

    <GameRulesDialog open={rulesOpen} title="キャンバスの使い方" onClose={() => setRulesOpen(false)}>
      <p>ペンまたは消しゴムを選び、マウス・指・ペンで自由に描きます。色と線の太さはいつでも変更できます。</p>
      <p className="mt-3">「一手戻す」は最後の線を取り消し、「全消去」は白紙に戻します。描画は端末内へ自動保存されます。</p>
      <p className="mt-3">透明度を下げると、下の線や色が透ける半透明のペンとして重ね塗りできます。</p>
      <p className="mt-3">キーボードではAでペン、Sで消しゴム、Cで線を細く、Vで太くできます。虹色の丸から好きな色も選べます。</p>
      <p className="mt-3">水色の丸がキーボードカーソルです。矢印キーで移動し、スペースを押しながら矢印キーを押すと描画します。Shiftを併用すると速く移動します。</p>
      <p className="mt-3">現段階は描画UIのテスト版です。同じブラウザでこのページを2つ開くと、別タブへの同期を確認できます。得点・終了条件・時間切れはまだありません。</p>
    </GameRulesDialog>
    <GameRulesDialog open={shortcutsOpen} title="キーボードショートカット" onClose={() => setShortcutsOpen(false)}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3">
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">A</kbd></dt><dd>ペンへ切り替え</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">S</kbd></dt><dd>消しゴムへ切り替え</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">C</kbd></dt><dd>線を1段階細くする</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">V</kbd></dt><dd>線を1段階太くする</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Z</kbd></dt><dd>一手戻す</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Y</kbd></dt><dd>戻した操作をやり直す</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">矢印</kbd></dt><dd>水色のキーボードカーソルを移動</dd>
        <dt><span className="flex items-center gap-1"><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Space</kbd><span>＋</span><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">矢印</kbd></span></dt><dd>カーソルを動かしながら描画</dd>
        <dt><span className="flex items-center gap-1"><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Shift</kbd><span>＋</span><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">矢印</kbd></span></dt><dd>カーソルを速く移動</dd>
      </dl>
      <p className="mt-5 text-xs text-slate-400">入力欄を操作している間はショートカットが反応しません。</p>
    </GameRulesDialog>
  </main>;
}
