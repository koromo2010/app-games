import assert from "node:assert/strict";
import test from "node:test";
import { findCanvasUndoStrokeIndex, nextCanvasOwnerId } from "../lib/canvas-room.ts";
import type { DrawingStroke } from "../lib/drawing-canvas.ts";

const stroke = (id: string, authorId: string, layerId: string, inProgress = false): DrawingStroke => ({ id, authorId, layerId, inProgress, color: "#000000", width: 2, opacity: 1, tool: "pen", points: [{ x: 0, y: 0 }] });

test("共同描画のUndoは選択レイヤーにある本人の最後の確定線だけを選ぶ", () => {
  const strokes = [stroke("mine-old", "me", "base"), stroke("other", "you", "base"), stroke("mine-other-layer", "me", "color"), stroke("mine-draft", "me", "base", true)];
  assert.equal(findCanvasUndoStrokeIndex(strokes, "me", "base"), 0);
  assert.equal(findCanvasUndoStrokeIndex(strokes, "you", "base"), 1);
  assert.equal(findCanvasUndoStrokeIndex(strokes, "unknown", "base"), -1);
});

test("キャンバス所有者が退出すると最古の残存参加者へ所有権を移す", () => {
  assert.equal(nextCanvasOwnerId([
    { id: "later", name: "later", joinedAt: 30 },
    { id: "oldest", name: "oldest", joinedAt: 10 },
    { id: "middle", name: "middle", joinedAt: 20 },
  ]), "oldest");
  assert.equal(nextCanvasOwnerId([]), null);
});
