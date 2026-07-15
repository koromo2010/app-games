import assert from "node:assert/strict";
import test from "node:test";
import { clampDrawingPoint, floodFillPixels, normalizeDrawingStroke, normalizeDrawingStrokes } from "../lib/drawing-canvas.ts";

test("描画座標をキャンバス内へ収める", () => {
  assert.deepEqual(clampDrawingPoint({ x: -2, y: 3 }), { x: 0, y: 1 });
});

test("塗りつぶしは境界線を越えない", () => {
  const pixels = new Uint8ClampedArray(5 * 3 * 4);
  for (let y = 0; y < 3; y++) { const index = (y * 5 + 2) * 4; pixels[index + 3] = 255; }
  floodFillPixels(pixels, 5, 3, 0, 0, [255, 0, 0, 255]);
  assert.deepEqual(Array.from(pixels.slice(0, 4)), [255, 0, 0, 255]);
  assert.deepEqual(Array.from(pixels.slice((3 * 4), (4 * 4))), [0, 0, 0, 0]);
});

test("不正な描画値を安全に正規化する", () => {
  assert.deepEqual(normalizeDrawingStroke({ id: "a", color: "bad", width: 100, tool: "eraser", points: [{ x: 0.5, y: 0.25 }] }), {
    id: "a", color: "#0f172a", width: 40, opacity: 1, tool: "eraser", points: [{ x: 0.5, y: 0.25 }],
  });
  assert.equal(normalizeDrawingStroke({ id: "", points: [] }), null);
});

test("共同描画のレイヤーと作者を保持する", () => {
  const stroke = normalizeDrawingStroke({ id: "layered", layerId: "line-art", authorId: "player-1", color: "#000000", width: 2, tool: "pen", points: [{ x: 0.2, y: 0.3 }] });
  assert.equal(stroke?.layerId, "line-art");
  assert.equal(stroke?.authorId, "player-1");
});

test("保存できるストローク数に上限を設ける", () => {
  const source = Array.from({ length: 510 }, (_, index) => ({ id: String(index), color: "#000000", width: 2, tool: "pen", points: [{ x: 0, y: 0 }] }));
  const result = normalizeDrawingStrokes(source);
  assert.equal(result.length, 500);
  assert.equal(result[0].id, "10");
});
