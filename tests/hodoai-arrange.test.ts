import assert from "node:assert/strict";
import test from "node:test";
import { moveHodoaiCard, sameHodoaiOrder, shiftHodoaiCard } from "../lib/hodoai-arrange.ts";

test("ドラッグ対象を指定カードの位置へ移動する", () => {
  assert.deepEqual(moveHodoaiCard(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(moveHodoaiCard(["a", "b", "c"], "a", "c"), ["b", "c", "a"]);
});

test("キーボード用の左右移動は端を越えない", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(shiftHodoaiCard(order, "b", -1), ["b", "a", "c"]);
  assert.equal(shiftHodoaiCard(order, "a", -1), order);
  assert.equal(shiftHodoaiCard(order, "c", 1), order);
});

test("並び順の一致をカードIDと位置で判定する", () => {
  assert.equal(sameHodoaiOrder(["a", "b"], ["a", "b"]), true);
  assert.equal(sameHodoaiOrder(["a", "b"], ["b", "a"]), false);
});
