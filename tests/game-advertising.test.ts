import assert from "node:assert/strict";
import test from "node:test";
import { canRenderGameAd, gameAdSlotId, normalizeGameAdsMode } from "../lib/game-advertising.ts";

test("広告スロットは明示設定されるまで無効", () => {
  assert.equal(normalizeGameAdsMode(undefined), "off");
  assert.equal(normalizeGameAdsMode("unexpected"), "off");
  assert.equal(canRenderGameAd("off", "catalog"), false);
});

test("広告は予約済みの非プレイ面だけを識別する", () => {
  assert.equal(canRenderGameAd("preview", "room-lobby"), true);
  assert.equal(canRenderGameAd("live", "result"), true);
  assert.equal(canRenderGameAd("live", null), false);
  assert.equal(canRenderGameAd("live", "result", true), false);
  assert.equal(gameAdSlotId("WordWolf", "room-lobby"), "wordwolf:room-lobby");
});
