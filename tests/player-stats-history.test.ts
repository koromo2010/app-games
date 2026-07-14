import assert from "node:assert/strict";
import test from "node:test";
import { mergePlayerGameResults } from "../lib/player-stats-history.ts";

test("Postgres戦績を優先しながらRedis履歴を重複なく統合する", () => {
  const merged = mergePlayerGameResults(
    [{ id: "same", finishedAt: 20, source: "postgres" }, { id: "new", finishedAt: 30, source: "postgres" }],
    [{ id: "same", finishedAt: 20, source: "redis" }, { id: "legacy", finishedAt: 10, source: "redis" }],
  );
  assert.deepEqual(merged.map((result) => [result.id, result.source]), [
    ["new", "postgres"],
    ["same", "postgres"],
    ["legacy", "redis"],
  ]);
});

test("統合後の戦績件数を読み取り上限へ制限する", () => {
  const results = Array.from({ length: 5 }, (_, index) => ({ id: String(index), finishedAt: index }));
  assert.deepEqual(mergePlayerGameResults(results, [], 2).map((result) => result.id), ["4", "3"]);
});
