"use client";

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { mutateCanvasLobbyBoard } from "@/app/canvas/canvas-lobby-board-api-client";
import { sendCanvasStrokeProgress, type PublicCanvasRoom } from "@/app/canvas/canvas-room-api-client";
import type { DrawingStroke } from "@/lib/drawing-canvas";

type RoomRequest = (method: string, body?: unknown) => Promise<PublicCanvasRoom | null>;
const progressIntervalMs = 80;

export function useCanvasStrokeQueue({
  activeLayerId,
  room,
  playerId,
  strokes,
  lobbyRevisionRef,
  roomRequest,
  updateLocalStrokes,
  setStrokes,
  setPendingStrokes,
  setRedoStrokes,
}: {
  activeLayerId: string;
  room: PublicCanvasRoom | null;
  playerId?: string;
  strokes: DrawingStroke[];
  lobbyRevisionRef: MutableRefObject<number>;
  roomRequest: RoomRequest;
  updateLocalStrokes: (next: DrawingStroke[]) => void;
  setStrokes: Dispatch<SetStateAction<DrawingStroke[]>>;
  setPendingStrokes: Dispatch<SetStateAction<DrawingStroke[]>>;
  setRedoStrokes: Dispatch<SetStateAction<DrawingStroke[]>>;
}) {
  const pendingProgressRef = useRef<{ code: string; stroke: DrawingStroke } | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const progressRequestRef = useRef<Promise<unknown>>(Promise.resolve());

  const sendPendingProgress = useCallback(() => {
    const pending = pendingProgressRef.current;
    pendingProgressRef.current = null;
    progressTimerRef.current = null;
    if (!pending) return;
    progressRequestRef.current = progressRequestRef.current
      .catch(() => undefined)
      .then(() => sendCanvasStrokeProgress(pending.code, { type: "stroke-progress", stroke: pending.stroke }))
      .catch(() => undefined);
  }, []);

  useEffect(() => () => {
    if (progressTimerRef.current !== null) window.clearTimeout(progressTimerRef.current);
  }, []);

  const submitStroke = useCallback((stroke: DrawingStroke) => {
    const layeredStroke = { ...stroke, layerId: activeLayerId, authorId: playerId, updatedAt: Date.now() };
    if (!room) {
      if (!playerId) { updateLocalStrokes([...strokes, layeredStroke]); setRedoStrokes([]); return; }
      setPendingStrokes((pending) => [...pending, layeredStroke]);
      void mutateCanvasLobbyBoard({ action: "stroke", stroke: layeredStroke }).then((board) => {
        lobbyRevisionRef.current = Math.max(lobbyRevisionRef.current, board.revision);
        setStrokes(board.strokes);
        setPendingStrokes((pending) => pending.filter((item) => item.id !== layeredStroke.id));
      }).catch(() => setPendingStrokes((pending) => pending.filter((item) => item.id !== layeredStroke.id)));
      return;
    }
    setPendingStrokes((pending) => [...pending, layeredStroke]);
    pendingProgressRef.current = null;
    if (progressTimerRef.current !== null) { window.clearTimeout(progressTimerRef.current); progressTimerRef.current = null; }
    void progressRequestRef.current.catch(() => undefined).then(() => roomRequest("PATCH", { code: room.code, action: { type: "stroke", stroke: layeredStroke } })).then((result) => {
      if (!result) setPendingStrokes((pending) => pending.filter((item) => item.id !== layeredStroke.id));
    });
  }, [activeLayerId, lobbyRevisionRef, playerId, room, roomRequest, setPendingStrokes, setRedoStrokes, setStrokes, strokes, updateLocalStrokes]);

  const submitStrokeProgress = useCallback((stroke: DrawingStroke) => {
    if (!room) return;
    const layeredStroke = { ...stroke, layerId: activeLayerId, authorId: playerId, inProgress: true };
    pendingProgressRef.current = { code: room.code, stroke: layeredStroke };
    if (progressTimerRef.current === null) progressTimerRef.current = window.setTimeout(sendPendingProgress, progressIntervalMs);
  }, [activeLayerId, playerId, room, sendPendingProgress]);

  return { submitStroke, submitStrokeProgress };
}
