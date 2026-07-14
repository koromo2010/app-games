import assert from "node:assert/strict";
import test from "node:test";
import { resolveGameReplayPolicy } from "../lib/game-replay-policy.ts";
import { gameReplayShareText } from "../lib/game-replay-types.ts";
import { shouldRecordGameReplay } from "../lib/debug-replay.ts";

test("通常試合は記録し、デバッグ試合は明示的にONにした場合だけ記録する", () => {
  assert.equal(shouldRecordGameReplay({ debugMode: false, debugReplayEnabled: false }), true);
  assert.equal(shouldRecordGameReplay({ debugMode: true, debugReplayEnabled: false }), false);
  assert.equal(shouldRecordGameReplay({ debugMode: true, debugReplayEnabled: true }), true);
});

test("リプレイ設定の初期値は30日・お気に入り10件", () => {
  assert.deepEqual(resolveGameReplayPolicy({}), { retentionDays: 30, favoriteLimit: 10 });
});

test("リプレイ設定値は安全な範囲へ制限する", () => {
  assert.deepEqual(resolveGameReplayPolicy({
    GAME_REPLAY_RETENTION_DAYS: "0",
    GAME_REPLAY_FAVORITE_LIMIT: "999",
  }), { retentionDays: 1, favoriteLimit: 100 });
});

test("共有文にはプレイバックの見どころを含め、説明本文を要求しない", () => {
  const text = gameReplayShareText({
    gameType: "tahoiya",
    title: "未知語",
    resultLabel: "3点",
    shareHighlights: ["本物を見抜いたのは2人", "偽説明に集まった票は3票"],
  });
  assert.match(text, /たほい屋/);
  assert.match(text, /3点/);
  assert.match(text, /本物を見抜いたのは2人/);
  assert.equal(text.includes("本当の説明"), false);
});
