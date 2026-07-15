import assert from "node:assert/strict";
import test from "node:test";
import { clampDrawingPoint, normalizeDrawingStroke, normalizeDrawingStrokes } from "../lib/drawing-canvas.ts";

test("描画座標をキャンバス内へ収める", () => {
  assert.deepEqual(clampDrawingPoint({ x: -2, y: 3 }), { x: 0, y: 1 });
});

test("不正な描画値を安全に正規化する", () => {
  assert.deepEqual(normalizeDrawingStroke({ id: "a", color: "bad", width: 100, tool: "eraser", points: [{ x: 0.5, y: 0.25 }] }), {
    id: "a", color: "#0f172a", width: 40, opacity: 1, tool: "eraser", points: [{ x: 0.5, y: 0.25 }],
  });
  assert.equal(normalizeDrawingStroke({ id: "", points: [] }), null);
});

test("保存できるストローク数に上限を設ける", () => {
  const source = Array.from({ length: 510 }, (_, index) => ({ id: String(index), color: "#000000", width: 2, tool: "pen", points: [{ x: 0, y: 0 }] }));
  const result = normalizeDrawingStrokes(source);
  assert.equal(result.length, 500);
  assert.equal(result[0].id, "10");
});
