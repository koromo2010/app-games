import assert from "node:assert/strict";
import test from "node:test";
import {
  beginAiActivity,
  getAiActivitySnapshot,
  withAiActivity,
} from "../lib/ai-activity-client.ts";

test("AI通信が重なった場合はすべて完了するまでアクティブ状態を維持する", async () => {
  const finishFirst = beginAiActivity("お題生成");
  const finishSecond = beginAiActivity("回答判定");

  assert.equal(getAiActivitySnapshot().activeCount, 2);
  assert.equal(getAiActivitySnapshot().label, "回答判定");

  finishFirst();
  assert.equal(getAiActivitySnapshot().activeCount, 1);
  finishFirst();
  assert.equal(getAiActivitySnapshot().activeCount, 1);

  finishSecond();
  assert.deepEqual(getAiActivitySnapshot(), { activeCount: 0, label: "" });

  await assert.rejects(
    withAiActivity("失敗する処理", async () => {
      throw new Error("failed");
    }),
  );
  assert.equal(getAiActivitySnapshot().activeCount, 0);
});
