import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateGameDuration,
  gameDurationVariantKey,
  gameDurationStatisticsPolicy,
  isGameDurationGameId,
} from "../lib/game-duration-statistics.ts";

test("5件未満では初期目安を使うため実績値を返さない", () => {
  assert.equal(estimateGameDuration([600, 660, 720, 780]), null);
});

test("5件以上20件未満では外れ値に引かれにくい中央値を表示する", () => {
  const estimate = estimateGameDuration([600, 660, 720, 780, 7_200]);
  assert.equal(estimate?.sampleCount, 5);
  assert.equal(estimate?.medianSeconds, 720);
  assert.equal(estimate?.label, "約10分");
});

test("20件以上では中央50パーセントの範囲を表示する", () => {
  const durations = Array.from({ length: 20 }, (_, index) => 600 + index * 36);
  const estimate = estimateGameDuration(durations);
  assert.equal(estimate?.sampleCount, 20);
  assert.equal(estimate?.label, "10〜20分");
});

test("異常に短い試合と4時間超の放置は集計から除外する", () => {
  const estimate = estimateGameDuration([
    10,
    gameDurationStatisticsPolicy.maximumDurationSeconds + 1,
    600,
    660,
    720,
    780,
    840,
  ]);
  assert.equal(estimate?.sampleCount, 5);
  assert.equal(estimate?.medianSeconds, 720);
});

test("人数・主要ルールの集計キーは順序に依存しない", () => {
  assert.equal(
    gameDurationVariantKey({ rounds: 3, mode: "fixed", optional: undefined }),
    "mode=fixed;rounds=3",
  );
});

test("大富豪を実プレイ時間の集計対象として認識する", () => {
  assert.equal(isGameDurationGameId("daifugo"), true);
});
