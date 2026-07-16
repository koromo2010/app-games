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
import type { CanvasLayer, CanvasLayerMode, CanvasRoom } from "@/lib/canvas-room";
import { activeCanvasLobbyStrokes } from "@/lib/canvas-lobby-board";

const storageKey = "canvas-prototype-board";
const channelName = "game-fields-canvas-prototype";
const colors = ["#0f172a", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
const minimumZoom = 0.5;
const maximumZoom = 2;
const zoomStep = 0.1;

function clampZoom(value: number) {
  return Math.min(maximumZoom, Math.max(minimumZoom, Math.round(value * 10) / 10));
}

export function CanvasGame() {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<DrawingStroke[]>([]);
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(1);
  const [opacity, setOpacity] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<"pen" | "eraser" | "eyedropper" | "fill" | "pan">("pen");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [syncNotice, setSyncNotice] = useState("この端末に自動保存します");
  const [keyboardCursor, setKeyboardCursor] = useState<DrawingPoint>({ x: 0.5, y: 0.5 });
  const [keyboardCursorVisible, setKeyboardCursorVisible] = useState(false);
  const [room, setRoom] = useState<(Omit<CanvasRoom, "passphrase"> & { passphraseProtected: boolean }) | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [roomPassphrase, setRoomPassphrase] = useState("");
  const [roomBusy, setRoomBusy] = useState(false);
  const [layerMode, setLayerMode] = useState<CanvasLayerMode>("shared");
  const [localLayers, setLocalLayers] = useState<CanvasLayer[]>([{ id: "base", name: "レイヤー1", createdAt: 0 }]);
  const [activeLayerId, setActiveLayerId] = useState("base");
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(() => new Set());
  const [pendingStrokes, setPendingStrokes] = useState<DrawingStroke[]>([]);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const spacePressedRef = useRef(false);
  const keyboardStrokeIdRef = useRef<string | null>(null);
  const keyboardStrokeRef = useRef<DrawingStroke | null>(null);
  const pressedArrowKeysRef = useRef(new Set<string>());
  const roomRevisionRef = useRef(0);
  const lobbyRevisionRef = useRef(0);
  const boardViewportRef = useRef<HTMLDivElement>(null);

  const changeZoom = useCallback((delta: number) => {
    setZoom((current) => clampZoom(current + delta));
  }, []);

  useEffect(() => {
    const viewport = boardViewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      setZoom((current) => {
        const next = clampZoom(current + (event.deltaY < 0 ? zoomStep : -zoomStep));
        if (next === current) return current;
        const contentX = (viewport.scrollLeft + pointerX) / current;
        const contentY = (viewport.scrollTop + pointerY) / current;
        window.requestAnimationFrame(() => {
          viewport.scrollLeft = contentX * next - pointerX;
          viewport.scrollTop = contentY * next - pointerY;
        });
        return next;
      });
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [changeZoom]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSession(readPlayerSession());
      try { setStrokes(activeCanvasLobbyStrokes(normalizeDrawingStrokes(JSON.parse(localStorage.getItem(storageKey) || "[]")), Date.now())); } catch { setStrokes([]); }
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

  const roomRequest = useCallback(async (method: string, body?: unknown) => {
    setRoomBusy(true);
    try {
      const response = await fetch("/api/canvas/rooms", { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json() as { room?: typeof room; error?: string };
      if (!response.ok || !data.room) throw new Error(data.error || "ルーム操作に失敗しました");
      if (data.room.revision < roomRevisionRef.current) return data.room;
      roomRevisionRef.current = data.room.revision;
      setRoom(data.room); setStrokes(() => { const active = keyboardStrokeRef.current; return active ? [...data.room!.strokes.filter((stroke) => stroke.id !== active.id), active] : data.room!.strokes; });
      setTool((current) => current === "pan" ? "pen" : current);
      setPendingStrokes((pending) => pending.filter((stroke) => !data.room!.strokes.some((saved) => saved.id === stroke.id && !saved.inProgress)));
      const ownLayer = data.room.layerMode === "per-player" ? data.room.players.find((player) => player.id === session?.id)?.layerId : undefined;
      setActiveLayerId((current) => ownLayer || (data.room!.layers.some((layer) => layer.id === current) ? current : data.room!.layers[0]?.id || "base"));
      setRedoStrokes([]); return data.room;
    } catch (error) { window.alert(error instanceof Error ? error.message : "ルーム操作に失敗しました"); return null; }
    finally { setRoomBusy(false); }
  }, [session?.id]);

  const activeRoomCode = room?.code;
  useEffect(() => {
    if (!activeRoomCode) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/canvas/rooms?code=${encodeURIComponent(activeRoomCode)}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { room: NonNullable<typeof room> };
      if (data.room.revision < roomRevisionRef.current) return;
      roomRevisionRef.current = data.room.revision;
      setRoom(data.room); setStrokes(() => { const active = keyboardStrokeRef.current; return active ? [...data.room.strokes.filter((stroke) => stroke.id !== active.id), active] : data.room.strokes; });
      setPendingStrokes((pending) => pending.filter((stroke) => !data.room.strokes.some((saved) => saved.id === stroke.id && !saved.inProgress)));
    }, 150);
    return () => window.clearInterval(timer);
  }, [activeRoomCode]);

  useEffect(() => {
    if (!session?.id || activeRoomCode) return;
    let active = true;
    const load = async () => {
      const response = await fetch("/api/canvas/lobby-board", { cache: "no-store" });
      if (!response.ok || !active) return;
      const data = await response.json() as { board: { strokes: DrawingStroke[]; revision: number } };
      if (data.board.revision < lobbyRevisionRef.current) return;
      lobbyRevisionRef.current = data.board.revision;
      setActiveLayerId("base");
      setStrokes(() => { const active = keyboardStrokeRef.current; return active ? [...data.board.strokes.filter((stroke) => stroke.id !== active.id), active] : data.board.strokes; });
      setPendingStrokes((pending) => pending.filter((stroke) => !data.board.strokes.some((saved) => saved.id === stroke.id)));
      setSyncNotice("広場の落書きボード・描画は3日後に消えます");
    };
    void load();
    const timer = window.setInterval(() => void load(), 500);
    return () => { active = false; window.clearInterval(timer); };
  }, [activeRoomCode, session?.id]);

  const submitStroke = useCallback((stroke: DrawingStroke) => {
    const layeredStroke = { ...stroke, layerId: activeLayerId, authorId: session?.id, updatedAt: Date.now() };
    if (!room) {
      if (!session?.id) { updateStrokes([...strokes, layeredStroke]); setRedoStrokes([]); return; }
      setPendingStrokes((pending) => [...pending, layeredStroke]);
      void fetch("/api/canvas/lobby-board", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stroke", stroke: layeredStroke }) }).then(async (response) => {
        if (!response.ok) throw new Error("落書きの保存に失敗しました");
        const data = await response.json() as { board: { strokes: DrawingStroke[]; revision: number } };
        lobbyRevisionRef.current = Math.max(lobbyRevisionRef.current, data.board.revision); setStrokes(data.board.strokes); setPendingStrokes((pending) => pending.filter((item) => item.id !== layeredStroke.id));
      }).catch(() => setPendingStrokes((pending) => pending.filter((item) => item.id !== layeredStroke.id)));
      return;
    }
    setPendingStrokes((pending) => [...pending, layeredStroke]);
    void roomRequest("PATCH", { code: room.code, action: { type: "stroke", stroke: layeredStroke } }).then((result) => {
      if (!result) setPendingStrokes((pending) => pending.filter((item) => item.id !== layeredStroke.id));
    });
  }, [activeLayerId, room, roomRequest, session?.id, strokes, updateStrokes]);

  const submitStrokeProgress = useCallback((stroke: DrawingStroke) => {
    if (!room) return;
    const layeredStroke = { ...stroke, layerId: activeLayerId, authorId: session?.id, inProgress: true };
    void fetch("/api/canvas/rooms", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: room.code, action: { type: "stroke-progress", stroke: layeredStroke } }) });
  }, [activeLayerId, room, session?.id]);

  const layers = room?.layers || (session?.id ? [{ id: "base", name: "落書き", createdAt: 0 }] : localLayers);
  const pendingIds = new Set(pendingStrokes.map((stroke) => stroke.id));
  const visibleStrokes = [...strokes.filter((stroke) => !pendingIds.has(stroke.id)), ...pendingStrokes]
    .filter((stroke) => !hiddenLayerIds.has(stroke.layerId || "base"))
    .sort((left, right) => layers.findIndex((layer) => layer.id === (left.layerId || "base")) - layers.findIndex((layer) => layer.id === (right.layerId || "base")));
  const canUndo = strokes.some((stroke) => (stroke.layerId || "base") === activeLayerId && !stroke.inProgress && (session?.id ? stroke.authorId === session.id : !room));

  const undo = useCallback(() => {
    if (room) { void roomRequest("PATCH", { code: room.code, action: { type: "undo", layerId: activeLayerId } }); return; }
    if (session?.id) { void fetch("/api/canvas/lobby-board", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "undo" }) }).then(async (response) => { if (response.ok) { const data = await response.json() as { board: { strokes: DrawingStroke[]; revision: number } }; lobbyRevisionRef.current = Math.max(lobbyRevisionRef.current, data.board.revision); setStrokes(data.board.strokes); } }); return; }
    setStrokes((current) => {
      const index = current.findLastIndex((stroke) => (stroke.layerId || "base") === activeLayerId);
      const removed = current[index];
      if (!removed || index < 0) return current;
      const next = current.filter((_, strokeIndex) => strokeIndex !== index);
      setRedoStrokes((redo) => [...redo, removed]);
      localStorage.setItem(storageKey, JSON.stringify(next));
      channelRef.current?.postMessage(next);
      setSyncNotice("一手戻しました");
      return next;
    });
  }, [activeLayerId, room, roomRequest, session?.id]);

  const redo = useCallback(() => {
    if (room) return;
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
  }, [room]);

  useEffect(() => {
    const editableTarget = (event: KeyboardEvent) => (event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || editableTarget(event)) return;
      const key = event.key.toLowerCase();
      if (event.code === "Space") {
        setKeyboardCursorVisible(true);
        if (!spacePressedRef.current) {
          const id = crypto.randomUUID();
          keyboardStrokeIdRef.current = id;
          const keyboardStroke: DrawingStroke = { id, layerId: activeLayerId, authorId: session?.id, color, width, opacity, tool: tool === "eraser" ? "eraser" : "pen", points: [keyboardCursor] };
          keyboardStrokeRef.current = keyboardStroke;
          setStrokes((current) => {
            const next = normalizeDrawingStrokes([...current.filter((stroke) => stroke.id !== id), keyboardStroke]);
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
      else if (event.key === "+" || event.key === "=") changeZoom(zoomStep);
      else if (event.key === "-" || event.key === "_") changeZoom(-zoomStep);
      else if (event.key === "0") setZoom(1);
      else if (event.key.startsWith("Arrow")) {
        setKeyboardCursorVisible(true);
        pressedArrowKeysRef.current.add(event.key);
        const distance = event.shiftKey ? 0.04 : 0.012;
        const horizontal = Number(pressedArrowKeysRef.current.has("ArrowRight")) - Number(pressedArrowKeysRef.current.has("ArrowLeft"));
        const vertical = Number(pressedArrowKeysRef.current.has("ArrowDown")) - Number(pressedArrowKeysRef.current.has("ArrowUp"));
        const diagonalCorrection = horizontal !== 0 && vertical !== 0 ? Math.SQRT1_2 : 1;
        setKeyboardCursor((current) => {
          const next = clampDrawingPoint({
            x: current.x + horizontal * distance * diagonalCorrection,
            y: current.y + vertical * distance * diagonalCorrection,
          });
          if (spacePressedRef.current && (next.x !== current.x || next.y !== current.y)) {
            const activeStroke = keyboardStrokeRef.current;
            if (activeStroke) keyboardStrokeRef.current = { ...activeStroke, points: [...activeStroke.points, next] };
            setStrokes((currentStrokes) => {
              const activeId = keyboardStrokeIdRef.current;
              const currentKeyboardStroke = keyboardStrokeRef.current;
              const found = activeId ? currentStrokes.some((stroke) => stroke.id === activeId) : false;
              const nextStrokes = activeId && currentKeyboardStroke
                ? found
                  ? currentStrokes.map((stroke) => stroke.id === activeId ? currentKeyboardStroke : stroke)
                  : [...currentStrokes, currentKeyboardStroke]
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
    const releaseSpace = () => {
      const stroke = keyboardStrokeRef.current;
      if (stroke && room) {
        setPendingStrokes((pending) => [...pending.filter((item) => item.id !== stroke.id), stroke]);
        void roomRequest("PATCH", { code: room.code, action: { type: "stroke", stroke } });
      } else if (stroke && session?.id) {
        const completed = { ...stroke, authorId: session.id, updatedAt: Date.now() };
        setPendingStrokes((pending) => [...pending.filter((item) => item.id !== completed.id), completed]);
        setStrokes((current) => current.filter((item) => item.id !== completed.id));
        void fetch("/api/canvas/lobby-board", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stroke", stroke: completed }) }).then(async (response) => {
          if (!response.ok) throw new Error("落書きの保存に失敗しました");
          const data = await response.json() as { board: { strokes: DrawingStroke[]; revision: number } };
          lobbyRevisionRef.current = Math.max(lobbyRevisionRef.current, data.board.revision);
          setStrokes(data.board.strokes);
          setPendingStrokes((pending) => pending.filter((item) => item.id !== completed.id));
        }).catch(() => setPendingStrokes((pending) => pending.filter((item) => item.id !== completed.id)));
      }
      spacePressedRef.current = false; keyboardStrokeIdRef.current = null; keyboardStrokeRef.current = null;
    };
    const releaseAllKeys = () => { releaseSpace(); pressedArrowKeysRef.current.clear(); };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") releaseSpace();
      if (event.key.startsWith("Arrow")) pressedArrowKeysRef.current.delete(event.key);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAllKeys);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", releaseAllKeys); };
  }, [activeLayerId, changeZoom, color, keyboardCursor, opacity, redo, room, roomRequest, session?.id, tool, undo, width]);

  return <main className={`min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#f8fafc_42%,#fef3c7_100%)] text-slate-900 ${gameTopBannerOffsetClass}`}>
    <GameTopBanner eyebrow="PRIVATE UI PROTOTYPE" title="キャンバス">
      <Link href="/games" className={gameTopBannerActionClass}>広場へ戻る</Link>
      <GameTopMenu>
        <button type="button" data-menu-close="true" className={gameTopMenuItemClass} onClick={() => setRulesOpen(true)}>ルール・使い方 <span>›</span></button>
        <button type="button" data-menu-close="true" className={gameTopMenuItemClass} onClick={() => { updateStrokes([]); setRedoStrokes([]); }}>新しいキャンバス <span>↻</span></button>
      </GameTopMenu>
      <GamePlayerMenu id={session?.id} name={session?.name || "ゲスト"} avatarColor={session?.avatarColor || fallbackAvatarColor} avatarImage={session?.avatarImage} />
    </GameTopBanner>

    <section className="mx-auto grid max-w-[1500px] gap-4 px-3 py-5 sm:px-6 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-start">
      <aside className="flex flex-wrap items-center gap-2 rounded-2xl border border-cyan-200 bg-white/90 p-3 shadow-lg xl:sticky xl:top-20 xl:flex-col xl:items-stretch">
        <strong className="mr-2 text-sm xl:mb-1 xl:text-base">キャンバスロビー</strong>
        {!room ? <>
          <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().slice(0, 4))} placeholder="ルームコード" aria-label="ルームコード" className="w-32 rounded-lg border px-3 py-2 text-sm uppercase xl:w-full" />
          <input value={roomPassphrase} onChange={(event) => setRoomPassphrase(event.target.value)} placeholder="合言葉（任意）" aria-label="合言葉" className="w-36 rounded-lg border px-3 py-2 text-sm xl:w-full" />
          <button disabled={roomBusy || !session?.id || roomCode.length !== 4} onClick={() => void roomRequest("PATCH", { code: roomCode, action: { type: "join", passphrase: roomPassphrase } })} className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">参加</button>
          <select value={layerMode} onChange={(event) => setLayerMode(event.target.value as CanvasLayerMode)} aria-label="レイヤーモード" className="rounded-lg border px-2 py-2 text-sm xl:w-full"><option value="shared">自由レイヤー</option><option value="per-player">プレイヤー別レイヤー</option></select>
          <button disabled={roomBusy || !session?.id} onClick={() => void roomRequest("POST", { passphrase: roomPassphrase, layerMode })} className="rounded-lg border border-cyan-700 px-3 py-2 text-sm font-bold text-cyan-800 disabled:opacity-40">部屋を作る</button>
          {!session?.id && <span className="text-xs text-amber-700">ログインすると利用できます</span>}
        </> : <>
          <span className="rounded bg-slate-900 px-3 py-1 font-mono font-black tracking-widest text-white">{room.code}</span>
          <span className="text-sm font-bold">{room.players.length}人：{room.players.map((player) => player.name).join("、")}</span>
          <button disabled={roomBusy} onClick={async () => { if (room.ownerId === session?.id) { await fetch(`/api/canvas/rooms?code=${room.code}`, { method: "DELETE" }); } else { await roomRequest("PATCH", { code: room.code, action: { type: "leave" } }); } setRoom(null); }} className="ml-auto rounded-lg border px-3 py-2 text-sm font-bold xl:ml-0">{room.ownerId === session?.id ? "部屋を閉じる" : "退出"}</button>
        </>}
      </aside>
      <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-fuchsia-200 bg-white/90 p-3 shadow-lg" aria-label="レイヤー">
        <strong className="mr-1 text-sm">レイヤー</strong>
        {layers.map((layer) => {
          const fixed = room?.layerMode === "per-player";
          const canSelect = !fixed || layer.ownerId === session?.id;
          const hidden = hiddenLayerIds.has(layer.id);
          return <div key={layer.id} className={`flex items-center rounded-lg border ${activeLayerId === layer.id ? "border-fuchsia-500 bg-fuchsia-50" : "border-slate-200"}`}>
            <button type="button" aria-pressed={!hidden} aria-label={`${layer.name}を${hidden ? "表示" : "非表示"}`} onClick={() => setHiddenLayerIds((current) => { const next = new Set(current); if (next.has(layer.id)) next.delete(layer.id); else next.add(layer.id); return next; })} className="px-2 py-1.5 text-xs">{hidden ? "○" : "●"}</button>
            <button type="button" disabled={!canSelect} aria-pressed={activeLayerId === layer.id} onClick={() => setActiveLayerId(layer.id)} className="px-2 py-1.5 text-sm font-bold disabled:opacity-40">{layer.name}</button>
            {room?.layerMode !== "per-player" && (room?.ownerId === session?.id || !room) && layers.length > 1 && <button type="button" aria-label={`${layer.name}を削除`} onClick={() => { if (room) void roomRequest("PATCH", { code: room.code, action: { type: "remove-layer", layerId: layer.id } }); else { setLocalLayers((current) => current.filter((item) => item.id !== layer.id)); setStrokes((current) => current.filter((stroke) => stroke.layerId !== layer.id)); if (activeLayerId === layer.id) setActiveLayerId(layers[0].id); } }} className="px-2 text-xs text-rose-600">×</button>}
          </div>;
        })}
        {(room?.layerMode !== "per-player" && (room || !session?.id)) && <button type="button" onClick={() => { if (room) void roomRequest("PATCH", { code: room.code, action: { type: "add-layer" } }); else { const layer = { id: crypto.randomUUID(), name: `レイヤー${localLayers.length + 1}`, createdAt: Date.now() }; setLocalLayers((current) => [...current, layer]); setActiveLayerId(layer.id); } }} className="rounded-lg border border-fuchsia-300 px-3 py-1.5 text-sm font-bold text-fuchsia-800">＋追加</button>}
        {room && <span className="ml-auto text-xs text-slate-500">{room.layerMode === "per-player" ? "各プレイヤー専用" : "自由に切替"}</span>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-xl shadow-slate-300/40 backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1" aria-label="描画ツール">
            <button type="button" aria-pressed={tool === "pen"} onClick={() => setTool("pen")} className={`rounded-lg px-4 py-2 text-sm font-black ${tool === "pen" ? "bg-slate-900 text-white" : "text-slate-600"}`}>ペン <kbd className="ml-1 opacity-60">A</kbd></button>
            <button type="button" aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} className={`rounded-lg px-4 py-2 text-sm font-black ${tool === "eraser" ? "bg-slate-900 text-white" : "text-slate-600"}`}>消しゴム <kbd className="ml-1 opacity-60">S</kbd></button>
            <button type="button" aria-pressed={tool === "eyedropper"} onClick={() => setTool("eyedropper")} className={`rounded-lg px-3 py-2 text-sm font-black ${tool === "eyedropper" ? "bg-slate-900 text-white" : "text-slate-600"}`}>スポイト</button>
            <button type="button" aria-pressed={tool === "fill"} onClick={() => setTool("fill")} className={`rounded-lg px-3 py-2 text-sm font-black ${tool === "fill" ? "bg-slate-900 text-white" : "text-slate-600"}`}>塗りつぶし</button>
            {!room && <button type="button" aria-pressed={tool === "pan"} onClick={() => setTool("pan")} className={`rounded-lg px-3 py-2 text-sm font-black ${tool === "pan" ? "bg-slate-900 text-white" : "text-slate-600"}`}>✋ 移動</button>}
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
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50" aria-label="表示倍率">
            <button type="button" disabled={zoom <= minimumZoom} onClick={() => changeZoom(-zoomStep)} aria-label="縮小" className="px-2.5 py-2 text-sm font-black disabled:opacity-30">−</button>
            <button type="button" onClick={() => setZoom(1)} title="100%に戻す" className="min-w-14 border-x border-slate-200 px-2 py-2 text-xs font-black tabular-nums">{Math.round(zoom * 100)}%</button>
            <button type="button" disabled={zoom >= maximumZoom} onClick={() => changeZoom(zoomStep)} aria-label="拡大" className="px-2.5 py-2 text-sm font-black disabled:opacity-30">＋</button>
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setShortcutsOpen(true)} className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-bold text-cyan-800">⌨ ショートカット</button>
            <button type="button" disabled={!canUndo} onClick={undo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">自分の一手戻す <kbd className="opacity-50">Z</kbd></button>
            <button type="button" disabled={room !== null || redoStrokes.length === 0} onClick={redo} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-40">やり直す <kbd className="opacity-50">Y</kbd></button>
            <button type="button" disabled={strokes.length === 0 || (room !== null && room.ownerId !== session?.id)} onClick={() => { if (window.confirm("キャンバスをすべて消しますか？")) { if (room) void roomRequest("PATCH", { code: room.code, action: { type: "clear" } }); else { updateStrokes([]); setRedoStrokes([]); } } }} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-40">全消去</button>
          </div>
        </div>
      </div>

      {!room && <div className="flex items-center justify-between gap-2 px-1"><div><h2 className="font-black text-slate-800">みんなの落書きボード</h2><p className="text-xs font-semibold text-slate-500">通常の4倍の広さ・スクロール対応・描画は3日後に自動で消えます{!session?.id && "（ログインすると全員に共有）"}</p></div><span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-600">↔ ↕ スクロール</span></div>}
      <div ref={boardViewportRef} className="max-h-[72vh] overflow-auto rounded-2xl border-4 border-white bg-white shadow-2xl shadow-slate-400/40">
        <div className={room ? "aspect-[4/3] min-h-[320px] w-full" : "h-[1200px] w-[1600px]"} style={{ zoom }}><DrawingCanvas strokes={visibleStrokes} layerIds={layers.filter((layer) => !hiddenLayerIds.has(layer.id)).map((layer) => layer.id)} activeLayerId={activeLayerId} color={color} width={width} opacity={opacity} tool={tool} keyboardCursor={keyboardCursorVisible ? keyboardCursor : undefined} onPointerInteraction={() => setKeyboardCursorVisible(false)} onPointerPosition={setKeyboardCursor} onColorPick={(picked) => { setColor(picked); setTool("pen"); }} onStrokeProgress={submitStrokeProgress} onPan={(deltaX, deltaY) => boardViewportRef.current?.scrollBy(deltaX, deltaY)} onStrokeComplete={submitStroke} /></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs font-semibold text-slate-500"><span>{syncNotice}</span><span>A ペン・S 消しゴム・C 細く・V 太く・Z 戻す・Y やり直す</span><span>＋/− 拡大縮小・0 等倍・Ctrl＋ホイール</span><span>矢印 移動・Space＋矢印 描画・Shift 高速</span><span>{strokes.length}ストローク</span></div>
      </div>
    </section>

    <GameRulesDialog open={rulesOpen} title="キャンバスの使い方" onClose={() => setRulesOpen(false)}>
      <p>マウス、指、ペン、キーボードで自由に絵を描けるキャンバスです。今は描き心地や操作方法を試すためのテスト版です。</p>
      <h3 className="mt-4 font-black text-white">基本の描き方</h3>
      <ol className="mt-2 list-decimal space-y-2 pl-5">
        <li>「ペン」を選び、キャンバスの上をドラッグすると線を描けます。</li>
        <li>色、線の太さ、透明度はいつでも変更できます。透明度を下げると、下の線が透ける半透明の色になります。</li>
        <li>「消しゴム」で線を消せます。「自分の一手戻す」は選択中のレイヤーで自分が最後に描いた線だけを取り消します。「やり直す」で戻した線を元に戻せます。</li>
        <li>「全消去」はすべての線を消して白紙にします。確認画面が出るので、まちがえて押してもすぐには消えません。</li>
      </ol>
      <h3 className="mt-4 font-black text-white">キーボードで描く</h3>
      <p className="mt-2">水色の丸がキーボードカーソルです。矢印キーで移動し、Spaceを押しながら矢印キーを押すと線を描けます。Shiftも一緒に押すと速く動きます。くわしいキーは「キーボードショートカット」で確認できます。</p>
      <h3 className="mt-4 font-black text-white">保存と同期</h3>
      <p className="mt-2">通常の描画はこの端末へ自動保存されます。「みんなで描く」ではルームコードを共有して別端末から同じ絵を編集できます。作成時に、全員が自由に切り替えるレイヤーか、参加者ごとの専用レイヤーを選べます。</p>
      <h3 className="mt-4 font-black text-white">レイヤー</h3>
      <p className="mt-2">●で表示・非表示を切り替え、名前のボタンで描画先を選びます。レイヤーごとに描画面を分けているため、消しゴムは選択中のレイヤーだけに作用します。</p>
      <h3 className="mt-4 font-black text-white">得点・終了・時間制限</h3>
      <p className="mt-2 rounded-lg bg-sky-300/10 p-3">現在はゲームではなく描画機能のテスト版なので、得点、勝ち負け、終了条件、時間制限はありません。描いた結果が戦績に記録されることもありません。</p>
    </GameRulesDialog>
    <GameRulesDialog open={shortcutsOpen} title="キーボードショートカット" onClose={() => setShortcutsOpen(false)}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3">
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">A</kbd></dt><dd>ペンへ切り替え</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">S</kbd></dt><dd>消しゴムへ切り替え</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">C</kbd></dt><dd>線を1段階細くする</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">V</kbd></dt><dd>線を1段階太くする</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Z</kbd></dt><dd>一手戻す</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Y</kbd></dt><dd>戻した操作をやり直す</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">＋ / −</kbd></dt><dd>キャンバスを10%ずつ拡大・縮小</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">0</kbd></dt><dd>表示倍率を100%に戻す</dd>
        <dt><span className="flex items-center gap-1"><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Ctrl / ⌘</kbd><span>＋ホイール</span></span></dt><dd>マウス位置で拡大・縮小。通常のホイールはスクロール</dd>
        <dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">矢印</kbd></dt><dd>水色のキーボードカーソルを移動。上下と左右の同時押しで斜め移動</dd>
        <dt><span className="flex items-center gap-1"><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Space</kbd><span>＋</span><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">矢印</kbd></span></dt><dd>カーソルを動かしながら描画</dd>
        <dt><span className="flex items-center gap-1"><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">Shift</kbd><span>＋</span><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-white">矢印</kbd></span></dt><dd>カーソルを速く移動</dd>
      </dl>
      <p className="mt-5 text-xs text-slate-400">入力欄を操作している間はショートカットが反応しません。</p>
    </GameRulesDialog>
  </main>;
}
