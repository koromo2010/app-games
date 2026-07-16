import assert from "node:assert/strict";
import test from "node:test";
import { canvasFeatures } from "../lib/canvas-features.ts";

test("落書きボードはレイヤーなし、共同ルームはレイヤーあり", () => {
  assert.equal(canvasFeatures("lobbyBoard").layers, false);
  assert.equal(canvasFeatures("collaborativeRoom").layers, true);
});

test("キャンバス単位で機能を個別上書きできる", () => {
  const features = canvasFeatures("lobbyBoard", { fill: false, zoom: false });
  assert.equal(features.fill, false);
  assert.equal(features.zoom, false);
  assert.equal(features.fullscreen, true);
});
