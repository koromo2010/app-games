import assert from "node:assert/strict";
import test from "node:test";
import { classifyRedisConsolidationKey } from "../scripts/redis-consolidation-keys.mjs";

test("既存development namespaceは同じ物理キーを維持する", () => {
  assert.deepEqual(classifyRedisConsolidationKey("app-dev:room:ABCD"), {
    classification: "platform-development",
    targetKey: "app-dev:room:ABCD",
    automatic: true,
  });
  assert.deepEqual(classifyRedisConsolidationKey("sdk:development:preview-instance:v1:moi-lab"), {
    classification: "sdk-portal-development",
    targetKey: "sdk:development:preview-instance:v1:moi-lab",
    automatic: true,
  });
});

test("旧SDK予約キーだけdevelopment namespaceへ写像する", () => {
  assert.deepEqual(classifyRedisConsolidationKey("sdk:preview-instance:v1:moi-lab"), {
    classification: "sdk-portal-development-legacy",
    targetKey: "sdk:development:preview-instance:v1:moi-lab",
    automatic: true,
  });
});

test("曖昧なrealtime stream・production・未知キーは自動移行しない", () => {
  assert.equal(classifyRedisConsolidationKey("online-room:events:v1").automatic, false);
  assert.equal(classifyRedisConsolidationKey("game-sdk-runtime:v2:production:game:room:ABCD").automatic, false);
  assert.deepEqual(classifyRedisConsolidationKey("other:key"), {
    classification: "unknown",
    targetKey: null,
    automatic: false,
  });
});
