import assert from "node:assert/strict";
import test from "node:test";
import { canStartHodoaiPointerDrag, hodoaiVerticalDisplayOrder, moveHodoaiCard, sameHodoaiOrder, shiftHodoaiCard, shiftHodoaiCardOnVerticalScale, usesCompactHodoaiCards } from "../lib/hodoai-arrange.ts";

test("9枚以上で詳細プレビュー付きの小型カードへ切り替える", () => {
  assert.equal(usesCompactHodoaiCards(8), false);
  assert.equal(usesCompactHodoaiCards(9), true);
  assert.equal(usesCompactHodoaiCards(121), true);
});

test("マウス左ボタンとタッチ操作でドラッグを開始する", () => {
  assert.equal(canStartHodoaiPointerDrag("mouse", 0), true);
  assert.equal(canStartHodoaiPointerDrag("mouse", 1), false);
  assert.equal(canStartHodoaiPointerDrag("touch", 0), true);
  assert.equal(canStartHodoaiPointerDrag("pen", 0), true);
});

test("ドラッグ対象を指定カードの位置へ移動する", () => {
  assert.deepEqual(moveHodoaiCard(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
  assert.deepEqual(moveHodoaiCard(["a", "b", "c"], "a", "c"), ["b", "c", "a"]);
});

test("内部の昇順を120が上の表示順へ反転する", () => {
  const order = ["small", "middle", "large"];
  assert.deepEqual(hodoaiVerticalDisplayOrder(order), ["large", "middle", "small"]);
  assert.deepEqual(order, ["small", "middle", "large"]);
});

test("キーボード用の並び移動は端を越えない", () => {
  const order = ["a", "b", "c"];
  assert.deepEqual(shiftHodoaiCard(order, "b", -1), ["b", "a", "c"]);
  assert.equal(shiftHodoaiCard(order, "a", -1), order);
  assert.equal(shiftHodoaiCard(order, "c", 1), order);
});

test("縦スケールで上へ動かしても内部データは昇順を保つ", () => {
  assert.deepEqual(shiftHodoaiCardOnVerticalScale(["small", "middle", "large"], "middle", -1), ["small", "large", "middle"]);
  assert.deepEqual(hodoaiVerticalDisplayOrder(shiftHodoaiCardOnVerticalScale(["small", "middle", "large"], "middle", -1)), ["middle", "large", "small"]);
});

test("並び順の一致をカードIDと位置で判定する", () => {
  assert.equal(sameHodoaiOrder(["a", "b"], ["a", "b"]), true);
  assert.equal(sameHodoaiOrder(["a", "b"], ["b", "a"]), false);
});
