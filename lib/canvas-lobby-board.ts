import type { DrawingStroke } from "@/lib/drawing-canvas";

export const canvasLobbyRetentionMs = 3 * 24 * 60 * 60 * 1000;
export function activeCanvasLobbyStrokes(strokes: DrawingStroke[], now: number, fallbackUpdatedAt = 0) {
  const cutoff = now - canvasLobbyRetentionMs;
  return strokes.filter((stroke) => (stroke.updatedAt || fallbackUpdatedAt) > cutoff);
}
