import type { DrawingStroke } from "@/lib/drawing-canvas";

export type CanvasRoomPlayer = { id: string; name: string; joinedAt: number };
export type CanvasRoom = { code: string; ownerId: string; passphrase?: string; players: CanvasRoomPlayer[]; strokes: DrawingStroke[]; revision: number; updatedAt: number };
export type CanvasRoomAction =
  | { type: "join"; passphrase?: string }
  | { type: "leave" }
  | { type: "stroke"; stroke: DrawingStroke }
  | { type: "undo" }
  | { type: "clear" };
