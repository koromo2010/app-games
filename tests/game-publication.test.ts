import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGamePublication } from "../lib/game-publication.ts";

test("登録時Privateのゲームを一般公開へ切り替えられる", () => {
  assert.equal(normalizeGamePublication("public", "private"), "public");
});

test("一般公開のゲームをプライベート公開または非表示へ切り替えられる", () => {
  assert.equal(normalizeGamePublication("private", "public"), "private");
  assert.equal(normalizeGamePublication("hidden", "public"), "hidden");
});

test("不正な公開状態だけは登録時の既定値へ戻す", () => {
  assert.equal(normalizeGamePublication("invalid", "private"), "private");
});
