"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { loadCanvasLobbyBoardView } from "@/app/canvas/canvas-lobby-board-api-client";
import { loadCanvasRoomView, type PublicCanvasRoom } from "@/app/canvas/canvas-room-api-client";
import type { DrawingStroke } from "@/lib/drawing-canvas";
import { canvasLobbyActiveSyncMs, canvasPollInterval } from "@/lib/canvas-sync-policy";

type SharedSyncState = {
  keyboardStrokeRef: MutableRefObject<DrawingStroke | null>;
  setStrokes: Dispatch<SetStateAction<DrawingStroke[]>>;
  setPendingStrokes: Dispatch<SetStateAction<DrawingStroke[]>>;
};

function mergeActiveStroke(strokes: DrawingStroke[], active: DrawingStroke | null) {
  return active ? [...strokes.filter((stroke) => stroke.id !== active.id), active] : strokes;
}

export function useCanvasRoomSync({ activeRoomCode, roomRevisionRef, setRoom, keyboardStrokeRef, setStrokes, setPendingStrokes }: SharedSyncState & {
  activeRoomCode?: string;
  roomRevisionRef: MutableRefObject<number>;
  setRoom: Dispatch<SetStateAction<PublicCanvasRoom | null>>;
}) {
  useEffect(() => {
    if (!activeRoomCode) return;
    const load = async () => {
      const room = await loadCanvasRoomView(activeRoomCode).catch(() => null);
      if (!room || room.revision < roomRevisionRef.current) return;
      roomRevisionRef.current = room.revision;
      setRoom(room);
      setStrokes(mergeActiveStroke(room.strokes, keyboardStrokeRef.current));
      setPendingStrokes((pending) => pending.filter((stroke) => !room.strokes.some((saved) => saved.id === stroke.id && !saved.inProgress)));
    };
    let active = true;
    let timer = 0;
    const schedule = () => { if (active) timer = window.setTimeout(run, canvasPollInterval("room", document.hidden)); };
    const run = async () => { await load(); schedule(); };
    timer = window.setTimeout(run, canvasPollInterval("room", document.hidden));
    return () => { active = false; window.clearTimeout(timer); };
  }, [activeRoomCode, keyboardStrokeRef, roomRevisionRef, setPendingStrokes, setRoom, setStrokes]);
}

export function useCanvasLobbyBoardSync({ activeRoomCode, playerId, lobbyRevisionRef, setActiveLayerId, setSyncNotice, keyboardStrokeRef, setStrokes, setPendingStrokes }: SharedSyncState & {
  activeRoomCode?: string;
  playerId?: string;
  lobbyRevisionRef: MutableRefObject<number>;
  setActiveLayerId: Dispatch<SetStateAction<string>>;
  setSyncNotice: Dispatch<SetStateAction<string>>;
}) {
  const [activityVersion, setActivityVersion] = useState(0);
  const activeUntilRef = useRef(0);
  const activate = useCallback(() => {
    const wasIdle = Date.now() >= activeUntilRef.current;
    activeUntilRef.current = Date.now() + canvasLobbyActiveSyncMs;
    if (wasIdle) setActivityVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!playerId || activeRoomCode) return;
    let active = true;
    const load = async () => {
      const board = await loadCanvasLobbyBoardView().catch(() => null);
      if (!active || !board || board.revision < lobbyRevisionRef.current) return;
      lobbyRevisionRef.current = board.revision;
      setActiveLayerId("base");
      setStrokes(mergeActiveStroke(board.strokes, keyboardStrokeRef.current));
      setPendingStrokes((pending) => pending.filter((stroke) => !board.strokes.some((saved) => saved.id === stroke.id)));
      setSyncNotice("広場の落書きボード・描画は3日後に消えます");
    };
    void load();
    if (activityVersion === 0) return () => { active = false; };
    let timer = window.setTimeout(run, canvasPollInterval("lobby", document.hidden));
    async function run() {
      await load();
      if (active && Date.now() < activeUntilRef.current) timer = window.setTimeout(run, canvasPollInterval("lobby", document.hidden));
    }
    return () => { active = false; window.clearTimeout(timer); };
  }, [activeRoomCode, activityVersion, keyboardStrokeRef, lobbyRevisionRef, playerId, setActiveLayerId, setPendingStrokes, setStrokes, setSyncNotice]);

  return activate;
}
