import assert from "node:assert/strict";
import test from "node:test";
import { appendGameDebugLog, normalizeGameDebugLog } from "../lib/game-debug-log.ts";

test("デバッグ行動ログは秘密のpayloadを受け取らない共通形式で追記する", () => {
  const entries = appendGameDebugLog([], {
    timestamp: 1000,
    actorName: "テスト1",
    action: "ヒントを提出",
    phaseBefore: "clue",
    phaseAfter: "arrange",
    revision: 3,
  });
  assert.deepEqual(entries[0], {
    id: "debug-1000-3-0",
    timestamp: 1000,
    actorName: "テスト1",
    action: "ヒントを提出",
    phaseBefore: "clue",
    phaseAfter: "arrange",
    revision: 3,
  });
  assert.equal("payload" in entries[0], false);
});

test("不正なデバッグログ項目は復元時に除外する", () => {
  assert.deepEqual(normalizeGameDebugLog([{ action: "不足" }, null, "text"]), []);
});
