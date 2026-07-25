import test from "node:test";
import assert from "node:assert/strict";
import {
  gameSdkResultHighlights,
  gameSdkResultPlayLog,
  gameSdkResultReasonText,
} from "../lib/game-sdk-result-presentation.ts";
import {
  presentGameSdkFeedbackArtifact,
} from "../lib/game-sdk-feedback-presentation.ts";

test("SDK result reason uses localized labels and safe known-code fallbacks", () => {
  assert.equal(gameSdkResultReasonText({
    reason: "turn-limit-reached",
  }, "ja"), "手数上限に達したため終了");
  assert.equal(gameSdkResultReasonText({
    reason: "turn-limit-reached",
  }, "en"), "The turn limit was reached");
  assert.equal(gameSdkResultReasonText({
    reason: "custom-finish-code",
    presentation: {
      reason: { ja: "全員が回答したため終了", en: "All players answered" },
    },
  }, "en"), "All players answered");
  assert.equal(gameSdkResultReasonText({
    reason: "unknown-internal-code",
  }, "ja"), "ゲームの終了条件を満たしました");
});

test("SDK result presentation exposes share highlights separately from play log", () => {
  const result = {
    presentation: {
      reason: { ja: "終了", en: "Finished" },
      highlights: [
        { ja: "秘密のことばを公開", en: "The secret word was revealed" },
      ],
      playLog: [
        { ja: "1手目：人間？ → いいえ", en: "Turn 1: Human? → No" },
      ],
    },
  };
  assert.deepEqual(gameSdkResultHighlights(result, "ja"), [
    "秘密のことばを公開",
  ]);
  assert.deepEqual(gameSdkResultPlayLog(result, "en"), [
    "Turn 1: Human? → No",
  ]);
});

test("SDK feedback preview translates verdict JSON without exposing raw JSON", () => {
  assert.deepEqual(presentGameSdkFeedbackArtifact(
    "{\"verdict\":\"definitely_no\"}",
    "akinator-five-verdict",
    "ja",
  ), {
    title: "AIの判定",
    summary: "判定：いいえ",
  });
  assert.deepEqual(presentGameSdkFeedbackArtifact(
    "{\"private_key\":\"opaque\"}",
    "custom-task",
    "ja",
  ), {
    title: "AIが生成した内容",
    summary: "ゲーム進行に使うデータを生成しました。",
  });
});
