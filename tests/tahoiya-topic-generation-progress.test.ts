import assert from "node:assert/strict";
import test from "node:test";
import {
  isTahoiyaTopicGenerationProgressFresh,
  normalizeTahoiyaTopicGenerationProgress,
  tahoiyaTopicGenerationProgressStaleMs,
} from "../lib/tahoiya-topic-generation-progress.ts";

test("たほい屋のお題生成進捗を部屋保存用に正規化する", () => {
  const progress = normalizeTahoiyaTopicGenerationProgress({
    id: "generation-1",
    stage: "screening-new",
    batchNumber: 2.9,
    batchLimit: 3,
    newCandidateFlow: true,
    startedAt: 100,
    updatedAt: 200,
  });
  assert.deepEqual(progress, {
    id: "generation-1",
    stage: "screening-new",
    batchNumber: 2,
    batchLimit: 3,
    newCandidateFlow: true,
    startedAt: 100,
    updatedAt: 200,
  });
});

test("不正な段階は表示せず、停止した生成進捗は期限切れにする", () => {
  assert.equal(normalizeTahoiyaTopicGenerationProgress({ id: "x", stage: "unknown", startedAt: 100, updatedAt: 200 }), undefined);
  const progress = normalizeTahoiyaTopicGenerationProgress({ id: "x", stage: "finalizing", startedAt: 100, updatedAt: 200 });
  assert.ok(progress);
  assert.equal(isTahoiyaTopicGenerationProgressFresh(progress, 200 + tahoiyaTopicGenerationProgressStaleMs - 1), true);
  assert.equal(isTahoiyaTopicGenerationProgressFresh(progress, 200 + tahoiyaTopicGenerationProgressStaleMs), false);
});
