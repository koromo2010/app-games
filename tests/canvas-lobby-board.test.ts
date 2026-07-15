import assert from "node:assert/strict";
import test from "node:test";
import { activeCanvasLobbyStrokes, canvasLobbyRetentionMs } from "../lib/canvas-lobby-board.ts";
import type { DrawingStroke } from "../lib/drawing-canvas.ts";

const stroke = (id: string, updatedAt: number): DrawingStroke => ({ id, updatedAt, color: "#000000", width: 2, opacity: 1, tool: "pen", points: [{ x: 0, y: 0 }] });
test("広場の落書きは作成から3日を過ぎると消える", () => {
  const now = 1_000_000_000;
  assert.deepEqual(activeCanvasLobbyStrokes([stroke("active", now - canvasLobbyRetentionMs + 1), stroke("expired", now - canvasLobbyRetentionMs)], now).map((item) => item.id), ["active"]);
});
