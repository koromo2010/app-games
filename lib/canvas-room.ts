import type { DrawingStroke } from "@/lib/drawing-canvas";

export type CanvasLayerMode = "shared" | "per-player";
export type CanvasLayer = { id: string; name: string; ownerId?: string; createdAt: number };
export type CanvasRoomPlayer = { id: string; name: string; joinedAt: number; layerId?: string };
export type CanvasRoom = { code: string; ownerId: string; passphrase?: string; layerMode: CanvasLayerMode; layers: CanvasLayer[]; players: CanvasRoomPlayer[]; strokes: DrawingStroke[]; revision: number; updatedAt: number };
export type CanvasRoomAction =
  | { type: "join"; passphrase?: string }
  | { type: "leave" }
  | { type: "stroke"; stroke: DrawingStroke }
  | { type: "stroke-progress"; stroke: DrawingStroke }
  | { type: "add-layer"; name?: string }
  | { type: "remove-layer"; layerId: string }
  | { type: "undo"; layerId?: string }
  | { type: "clear" };

export function findCanvasUndoStrokeIndex(strokes: DrawingStroke[], actorId: string, layerId?: string) {
  return strokes.findLastIndex((stroke) => stroke.authorId === actorId && !stroke.inProgress && (!layerId || stroke.layerId === layerId));
}
