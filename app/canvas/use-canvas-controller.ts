"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mutateCanvasLobbyBoard } from "./canvas-lobby-board-api-client";
import { canvasPlayerLayerId, deleteCanvasRoomView, mutateCanvasRoom, type PublicCanvasRoom } from "./canvas-room-api-client";
import { useCanvasStrokeQueue } from "./use-canvas-stroke-queue";
import { useCanvasLobbyBoardSync, useCanvasRoomSync } from "./use-canvas-sync";
import { confirmRoomClose, confirmRoomLeave } from "@/app/components/room-navigation-confirmation";
import { clampDrawingPoint, normalizeDrawingStrokes, type DrawingPoint, type DrawingStroke } from "@/lib/drawing-canvas";
import { readPlayerSession, type PlayerSession } from "@/lib/player-session";
import type { CanvasLayer, CanvasLayerMode } from "@/lib/canvas-room";
import { activeCanvasLobbyStrokes } from "@/lib/canvas-lobby-board";
import { canvasFeatures } from "@/lib/canvas-features";

const storageKey = "canvas-prototype-board";
const channelName = "game-fields-canvas-prototype";
const colors = ["#0f172a", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
const minimumZoom = 0.5;
const maximumZoom = 2;
const zoomStep = 0.1;

function clampZoom(value: number) {
  return Math.min(maximumZoom, Math.max(minimumZoom, Math.round(value * 10) / 10));
}

export function useCanvasController() {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<DrawingStroke[]>([]);
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(1);
  const [opacity, setOpacity] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [boardFullscreen, setBoardFullscreen] = useState(false);
  const [fullscreenToolsOpen, setFullscreenToolsOpen] = useState(false);
  const [tool, setTool] = useState<"pen" | "eraser" | "eyedropper" | "fill" | "pan">("pen");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [session, setSession] = useState<PlayerSession | null>(null);
  const [syncNotice, setSyncNotice] = useState("この端末に自動保存します");
  const [keyboardCursor, setKeyboardCursor] = useState<DrawingPoint>({ x: 0.5, y: 0.5 });
  const [keyboardCursorVisible, setKeyboardCursorVisible] = useState(false);
  const [room, setRoom] = useState<PublicCanvasRoom | null>(null);
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
  const boardShellRef = useRef<HTMLDivElement>(null);

  const changeZoom = useCallback((delta: number) => {
    setZoom((current) => clampZoom(current + delta));
  }, []);

  const openBoardFullscreen = async () => {
    const shell = boardShellRef.current;
    if (!shell) return;
    try { await shell.requestFullscreen?.(); } catch { /* Fixed-position fallback remains available. */ }
    setBoardFullscreen(true);
    setFullscreenToolsOpen(false);
  };

  const closeBoardFullscreen = useCallback(async () => {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    setBoardFullscreen(false);
    setFullscreenToolsOpen(false);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => { if (!document.fullscreenElement) setBoardFullscreen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && boardFullscreen) void closeBoardFullscreen(); };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("fullscreenchange", onFullscreenChange); window.removeEventListener("keydown", onKeyDown); };
  }, [boardFullscreen, closeBoardFullscreen]);

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
      const nextRoom = await mutateCanvasRoom(method as "POST" | "PATCH", body);
      if (nextRoom.revision < roomRevisionRef.current) return nextRoom;
      roomRevisionRef.current = nextRoom.revision;
      setRoom(nextRoom); setStrokes(() => { const active = keyboardStrokeRef.current; return active ? [...nextRoom.strokes.filter((stroke) => stroke.id !== active.id), active] : nextRoom.strokes; });
      setTool((current) => current === "pan" ? "pen" : current);
      setPendingStrokes((pending) => pending.filter((stroke) => !nextRoom.strokes.some((saved) => saved.id === stroke.id && !saved.inProgress)));
      const ownLayer = canvasPlayerLayerId(nextRoom, session?.id);
      setActiveLayerId((current) => ownLayer || (nextRoom.layers.some((layer) => layer.id === current) ? current : nextRoom.layers[0]?.id || "base"));
      setRedoStrokes([]); return nextRoom;
    } catch (error) { window.alert(error instanceof Error ? error.message : "ルーム操作に失敗しました"); return null; }
    finally { setRoomBusy(false); }
  }, [session]);

  const activeRoomCode = room?.code;
  useCanvasRoomSync({ activeRoomCode, roomRevisionRef, keyboardStrokeRef, setRoom, setStrokes, setPendingStrokes });
  const activateLobbySync = useCanvasLobbyBoardSync({ activeRoomCode, playerId: session?.id, lobbyRevisionRef, keyboardStrokeRef, setActiveLayerId, setStrokes, setPendingStrokes, setSyncNotice });

  const { submitStroke, submitStrokeProgress } = useCanvasStrokeQueue({ activeLayerId, room, playerId: session?.id, strokes, lobbyRevisionRef, roomRequest, updateLocalStrokes: updateStrokes, setStrokes, setPendingStrokes, setRedoStrokes });

  const layers = room?.layers || (session?.id ? [{ id: "base", name: "落書き", createdAt: 0 }] : localLayers);
  const pendingIds = new Set(pendingStrokes.map((stroke) => stroke.id));
  const visibleStrokes = [...strokes.filter((stroke) => !pendingIds.has(stroke.id)), ...pendingStrokes]
    .filter((stroke) => !hiddenLayerIds.has(stroke.layerId || "base"))
    .sort((left, right) => layers.findIndex((layer) => layer.id === (left.layerId || "base")) - layers.findIndex((layer) => layer.id === (right.layerId || "base")));
  const canUndo = strokes.some((stroke) => (stroke.layerId || "base") === activeLayerId && !stroke.inProgress && (session?.id ? stroke.authorId === session.id : !room));
  const canClear = room ? room.ownerId === session?.id && strokes.length > 0 : session?.id ? strokes.some((stroke) => stroke.authorId === session.id) : strokes.length > 0;
  const features = canvasFeatures(room ? "collaborativeRoom" : "lobbyBoard");

  const undo = useCallback(() => {
    if (room) { void roomRequest("PATCH", { code: room.code, action: { type: "undo", layerId: activeLayerId } }); return; }
    if (session?.id) { void mutateCanvasLobbyBoard({ action: "undo" }).then((board) => { lobbyRevisionRef.current = Math.max(lobbyRevisionRef.current, board.revision); setStrokes(board.strokes); }).catch(() => undefined); return; }
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
        if (!room) activateLobbySync();
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
        void mutateCanvasLobbyBoard({ action: "stroke", stroke: completed }).then((board) => {
          lobbyRevisionRef.current = Math.max(lobbyRevisionRef.current, board.revision);
          setStrokes(board.strokes);
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
  }, [activeLayerId, activateLobbySync, changeZoom, color, keyboardCursor, opacity, redo, room, roomRequest, session?.id, tool, undo, width]);


  const leaveCanvasRoom = async () => {
    if (!room) return;
    const isOwner = room.ownerId === session?.id;
    if (isOwner ? !confirmRoomClose() : !confirmRoomLeave()) return;
    try {
      if (isOwner) await deleteCanvasRoomView(room.code);
      else await roomRequest("PATCH", { code: room.code, action: { type: "leave" } });
      setRoom(null);
      setActiveLayerId("base");
      setHiddenLayerIds(new Set());
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "部屋から退出できませんでした");
    }
  };

  const clearCanvas = () => {
    const ownOnly = !room;
    if (!window.confirm(ownOnly ? "自分が描いた線をすべて消しますか？" : "キャンバスをすべて消しますか？")) return;
    if (room) {
      void roomRequest("PATCH", { code: room.code, action: { type: "clear" } });
    } else if (session?.id) {
      void mutateCanvasLobbyBoard({ action: "clear-own" }).then((board) => {
        lobbyRevisionRef.current = Math.max(lobbyRevisionRef.current, board.revision);
        setStrokes(board.strokes);
        setRedoStrokes([]);
      }).catch(() => undefined);
    } else {
      updateStrokes([]);
      setRedoStrokes([]);
    }
  };

  return {
    state: {
      strokes, redoStrokes, color, width, opacity, zoom, boardFullscreen,
      fullscreenToolsOpen, tool, rulesOpen, shortcutsOpen, session, syncNotice,
      keyboardCursor, keyboardCursorVisible, room, roomCode, roomPassphrase,
      roomBusy, layerMode, localLayers, activeLayerId, hiddenLayerIds,
    },
    setters: {
      setStrokes, setRedoStrokes, setColor, setWidth, setOpacity, setZoom,
      setFullscreenToolsOpen, setTool, setRulesOpen, setShortcutsOpen,
      setKeyboardCursor, setKeyboardCursorVisible, setRoomCode,
      setRoomPassphrase, setLayerMode, setLocalLayers, setActiveLayerId,
      setHiddenLayerIds,
    },
    refs: { boardViewportRef, boardShellRef },
    viewModel: {
      colors, minimumZoom, maximumZoom, zoomStep, layers, visibleStrokes,
      features,
    },
    permissions: { canUndo, canClear },
    actions: {
      changeZoom, openBoardFullscreen, closeBoardFullscreen, roomRequest,
      activateLobbySync, submitStroke, submitStrokeProgress, updateStrokes,
      undo, redo, leaveCanvasRoom, clearCanvas,
    },
  };
}

export type CanvasController = ReturnType<typeof useCanvasController>;
