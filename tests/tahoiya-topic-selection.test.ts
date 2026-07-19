import assert from "node:assert/strict";
import test from "node:test";
import { pickRotatingTahoiyaTopic } from "../lib/tahoiya-topic-selection.ts";

const candidates = [
  { id: "old-low-use", useCount: 0, lastUsedAt: 10, quality: 0 },
  { id: "new-low-use", useCount: 0, lastUsedAt: 20, quality: 5 },
  { id: "old-high-use", useCount: 3, lastUsedAt: 0, quality: 100 },
];

test("使用回数と最終使用が有利な候補だけをランダム抽選プールへ入れる", () => {
  const selected = pickRotatingTahoiyaTopic(candidates, (candidate) => candidate.quality, () => 0.999, 2);
  assert.equal(selected?.id, "new-low-use");
});

test("Good−Bad相当の品質点は候補を固定せず最大6倍の重みにする", () => {
  const pool = candidates.slice(0, 2);
  assert.equal(pickRotatingTahoiyaTopic(pool, (candidate) => candidate.quality, () => 0)?.id, "old-low-use");
  assert.equal(pickRotatingTahoiyaTopic(pool, (candidate) => candidate.quality, () => 0.2)?.id, "new-low-use");
});

test("候補がなければ選出しない", () => {
  assert.equal(pickRotatingTahoiyaTopic([], () => 0), null);
});
