import assert from "node:assert/strict";
import test from "node:test";
import { classifyRedisConsolidationKey } from "../scripts/redis-consolidation-keys.mjs";

test("既存development namespaceはkeepとして同じ物理キーを維持する", () => {
  assert.deepEqual(classifyRedisConsolidationKey("app-dev:room:ABCD"), {
    classification: "platform-development",
    targetKey: "app-dev:room:ABCD",
    automatic: false,
    disposition: "keep",
  });
  assert.deepEqual(classifyRedisConsolidationKey("sdk:development:preview-instance:v1:moi-lab"), {
    classification: "sdk-portal-development",
    targetKey: "sdk:development:preview-instance:v1:moi-lab",
    automatic: false,
    disposition: "keep",
  });
  assert.deepEqual(classifyRedisConsolidationKey("preview-dev:metric:one"), {
    classification: "preview-development",
    targetKey: "preview-dev:metric:one",
    automatic: false,
    disposition: "keep",
  });
});

test("旧SDK予約キーと既知のunprefixed development keyだけcopy候補にする", () => {
  assert.deepEqual(classifyRedisConsolidationKey("sdk:preview-instance:v1:moi-lab"), {
    classification: "sdk-portal-development-legacy",
    targetKey: "sdk:development:preview-instance:v1:moi-lab",
    automatic: true,
    disposition: "copy",
  });
  assert.deepEqual(classifyRedisConsolidationKey("game-sdk-runtime:v2:development:game:room:ABCD"), {
    classification: "platform-development-unprefixed",
    targetKey: "app-dev:game-sdk-runtime:v2:development:game:room:ABCD",
    automatic: true,
    disposition: "copy",
  });
});

test("実inventoryで観測したlegacy keyを非破壊方針へ分類する", () => {
  assert.deepEqual(classifyRedisConsolidationKey("sdk-preview:asset-token-metrics:2026073005"), {
    classification: "preview-development-legacy-metrics",
    targetKey: "preview-dev:sdk-preview:asset-token-metrics:2026073005",
    automatic: false,
    disposition: "expire-source",
  });
  assert.deepEqual(classifyRedisConsolidationKey("admin-observability-issues:v1"), {
    classification: "platform-development-legacy-admin-observability",
    targetKey: "app-dev:admin-observability-issues:v1",
    automatic: false,
    disposition: "retain-source",
  });
  assert.deepEqual(classifyRedisConsolidationKey("wordwolf:topic:catalog:v1"), {
    classification: "platform-development-legacy-wordwolf-catalog",
    targetKey: "app-dev:wordwolf:topic:catalog:v1",
    automatic: false,
    disposition: "retain-source",
  });
  assert.deepEqual(classifyRedisConsolidationKey("online-room:events:v1"), {
    classification: "realtime-stream-legacy",
    targetKey: "app-dev:online-room:events:v1",
    automatic: false,
    disposition: "retain-source",
  });
});

test("production・未知キーはmanualにする", () => {
  assert.equal(classifyRedisConsolidationKey("game-sdk-runtime:v2:production:game:room:ABCD").disposition, "manual");
  assert.deepEqual(classifyRedisConsolidationKey("other:key"), {
    classification: "unknown",
    targetKey: null,
    automatic: false,
    disposition: "manual",
  });
});
