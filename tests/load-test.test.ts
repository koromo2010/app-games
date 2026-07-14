import assert from "node:assert/strict";
import test from "node:test";
import { isRemoteTarget, percentile, summarizeSamples } from "../scripts/load-test.mjs";

test("負荷試験のパーセンタイルはnearest-rankで算出する", () => {
  assert.equal(percentile([40, 10, 30, 20], 0.5), 20);
  assert.equal(percentile([40, 10, 30, 20], 0.95), 40);
  assert.equal(percentile([], 0.95), 0);
});

test("負荷試験の集計はHTTP失敗と通信失敗を数える", () => {
  assert.deepEqual(summarizeSamples([
    { ok: true, status: 200, durationMs: 10 },
    { ok: false, status: 503, durationMs: 20 },
    { ok: false, status: "timeout", durationMs: 30 },
  ]), {
    requests: 3,
    succeeded: 1,
    failed: 2,
    errorRate: 2 / 3,
    statusCounts: { "200": 1, "503": 1, timeout: 1 },
    latencyMs: { p50: 20, p95: 30, p99: 30, max: 30 },
  });
});

test("localhost以外は明示許可が必要なremote targetとして扱う", () => {
  assert.equal(isRemoteTarget("http://localhost:3000"), false);
  assert.equal(isRemoteTarget("http://127.0.0.1:3000"), false);
  assert.equal(isRemoteTarget("https://www.game-fields.com"), true);
});
