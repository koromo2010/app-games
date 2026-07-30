import assert from "node:assert/strict";
import test from "node:test";
import {
  namespaceRedisCommand,
  namespaceRedisKey,
  redisKeyPrefixForConfigKey,
  resolveSocketRedisUrl,
} from "../lib/redis-store.ts";

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

test("開発Redis Integration URLを旧REDIS_URLより優先する", () => {
  assert.deepEqual(resolveSocketRedisUrl({
    DEV_REDIS_REDIS_URL: "rediss://development.test:6379",
    REDIS_URL: "rediss://legacy.test:6379",
  }), {
    key: "DEV_REDIS_REDIS_URL",
    url: "rediss://development.test:6379",
  });
});

test("共有有料Redisでもdevelopmentは物理prefixを強制する", () => {
  assert.equal(redisKeyPrefixForConfigKey("APP_REDIS_URL", {
    APP_REDIS_URL: "rediss://shared.test:6379",
    GAME_FIELDS_ENV: "development",
  }), "app-dev:");
  assert.equal(redisKeyPrefixForConfigKey("UPSTASH_REDIS_REST_URL", {
    UPSTASH_REDIS_REST_URL: "https://shared.test",
    VERCEL_GIT_COMMIT_REF: "develop",
  }), "app-dev:");
  assert.equal(redisKeyPrefixForConfigKey("APP_REDIS_URL", {
    APP_REDIS_URL: "rediss://shared.test:6379",
    GAME_FIELDS_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
  }), "");
  assert.notEqual(namespaceRedisKey("room:ABCD", "app-dev:"), namespaceRedisKey("room:ABCD", ""));
});

test("共有Redis上のapp-devキーを通常・複数・Lua・SCANコマンドへ適用する", () => {
  assert.deepEqual(namespaceRedisCommand(["GET", "player:1"], "app-dev:"), ["GET", "app-dev:player:1"]);
  assert.deepEqual(namespaceRedisCommand(["MGET", "player:1", "player:2"], "app-dev:"), ["MGET", "app-dev:player:1", "app-dev:player:2"]);
  assert.deepEqual(namespaceRedisCommand(["EVAL", "return 1", "2", "room:1", "room:2", "arg"], "app-dev:"), ["EVAL", "return 1", "2", "app-dev:room:1", "app-dev:room:2", "arg"]);
  assert.deepEqual(namespaceRedisCommand(["SCAN", "0", "MATCH", "account:*", "COUNT", "100"], "app-dev:"), ["SCAN", "0", "MATCH", "app-dev:account:*", "COUNT", "100"]);
  assert.deepEqual(namespaceRedisCommand(["GET", "app-dev:player:1"], "app-dev:"), ["GET", "app-dev:player:1"]);
});

test("Redis Streamsのwriter・reader・groupも同じnamespaceへ分離する", () => {
  assert.deepEqual(namespaceRedisCommand(["XADD", "online-room:events:v1", "*", "d", "{}"], "app-dev:"), [
    "XADD", "app-dev:online-room:events:v1", "*", "d", "{}",
  ]);
  assert.deepEqual(namespaceRedisCommand(["XREVRANGE", "online-room:events:v1", "+", "-"], "app-dev:"), [
    "XREVRANGE", "app-dev:online-room:events:v1", "+", "-",
  ]);
  assert.deepEqual(namespaceRedisCommand([
    "XREAD", "BLOCK", "5000", "STREAMS", "online-room:events:v1", "another-stream", "0-0", "0-0",
  ], "app-dev:"), [
    "XREAD", "BLOCK", "5000", "STREAMS", "app-dev:online-room:events:v1", "app-dev:another-stream", "0-0", "0-0",
  ]);
  assert.deepEqual(namespaceRedisCommand(["XGROUP", "CREATE", "online-room:events:v1", "workers", "$"], "app-dev:"), [
    "XGROUP", "CREATE", "app-dev:online-room:events:v1", "workers", "$",
  ]);
  assert.deepEqual(namespaceRedisCommand(["XINFO", "STREAM", "online-room:events:v1"], "app-dev:"), [
    "XINFO", "STREAM", "app-dev:online-room:events:v1",
  ]);
});

test("複数のIntegration Redis URLがあれば誤接続防止で停止する", () => {
  assert.throws(() => resolveSocketRedisUrl({
    devredis_REDIS_URL: "rediss://development.test:6379",
    production_REDIS_URL: "rediss://production.test:6379",
  }), /REDIS_STORE_URL_AMBIGUOUS/);
});
