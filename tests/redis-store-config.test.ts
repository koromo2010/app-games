import assert from "node:assert/strict";
import test from "node:test";
import { resolveSocketRedisUrl } from "../lib/redis-store.ts";

test("Integrationが発行した単一のRedis URLを検出する", () => {
  assert.deepEqual(resolveSocketRedisUrl({ devredis_REDIS_URL: "rediss://example.test:6379" }), {
    key: "devredis_REDIS_URL",
    url: "rediss://example.test:6379",
  });
});

test("APP_REDIS_URLをIntegration変数より優先する", () => {
  assert.deepEqual(resolveSocketRedisUrl({
    APP_REDIS_URL: "rediss://canonical.test:6379",
    devredis_REDIS_URL: "rediss://integration.test:6379",
  }), {
    key: "APP_REDIS_URL",
    url: "rediss://canonical.test:6379",
  });
});

test("複数のIntegration Redis URLがあれば誤接続防止で停止する", () => {
  assert.throws(() => resolveSocketRedisUrl({
    devredis_REDIS_URL: "rediss://development.test:6379",
    production_REDIS_URL: "rediss://production.test:6379",
  }), /REDIS_STORE_URL_AMBIGUOUS/);
});
