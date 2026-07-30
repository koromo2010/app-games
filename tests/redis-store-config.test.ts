import assert from "node:assert/strict";
import test from "node:test";
import {
  namespaceRedisCommand,
  namespaceRedisCommands,
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

test("開発Redis内でPlatformとPreview Runtimeを別namespaceへ分離する", () => {
  assert.equal(redisKeyPrefixForConfigKey("APP_REDIS_URL", {
    APP_REDIS_URL: "rediss://development.test:6379",
    GAME_FIELDS_ENV: "development",
    VERCEL_PROJECT_NAME: "app-games-dev",
  }), "app-dev:");
  assert.equal(redisKeyPrefixForConfigKey("UPSTASH_REDIS_REST_URL", {
    UPSTASH_REDIS_REST_URL: "https://development.test",
    VERCEL_GIT_COMMIT_REF: "develop",
    VERCEL_PROJECT_NAME: "app-games-dev",
  }), "app-dev:");
  assert.equal(redisKeyPrefixForConfigKey("APP_REDIS_URL", {
    APP_REDIS_URL: "rediss://development.test:6379",
    GAME_FIELDS_ENV: "candidate-preview",
    VERCEL_PROJECT_NAME: "app-games-preview-dev",
  }), "preview-dev:");
  assert.notEqual(namespaceRedisKey("room:ABCD", "app-dev:"), namespaceRedisKey("room:ABCD", "preview-dev:"));
});

test("production Platformはprefixなし、production PreviewのRedis誤設定は拒否する", () => {
  assert.equal(redisKeyPrefixForConfigKey("APP_REDIS_URL", {
    APP_REDIS_URL: "rediss://production.test:6379",
    GAME_FIELDS_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_PROJECT_NAME: "app-games",
  }), "");
  assert.throws(() => redisKeyPrefixForConfigKey("APP_REDIS_URL", {
    APP_REDIS_URL: "rediss://production.test:6379",
    GAME_FIELDS_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_PROJECT_NAME: "app-games-sdk-preview",
  }), /REDIS_STORE_PRODUCTION_PREVIEW_FORBIDDEN/);
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

test("REST pipelineとsocket transactionは同じ複数command変換を使う", () => {
  const commands = [
    ["GET", "room:one"],
    ["MGET", "player:one", "player:two"],
    ["EVAL", "return redis.call('GET', KEYS[1])", "1", "lock:one"],
    ["XREAD", "BLOCK", "1000", "STREAMS", "online-room:events:v1", "0-0"],
  ];
  assert.deepEqual(namespaceRedisCommands(commands, "app-dev:"), [
    ["GET", "app-dev:room:one"],
    ["MGET", "app-dev:player:one", "app-dev:player:two"],
    ["EVAL", "return redis.call('GET', KEYS[1])", "1", "app-dev:lock:one"],
    ["XREAD", "BLOCK", "1000", "STREAMS", "app-dev:online-room:events:v1", "0-0"],
  ]);
  assert.deepEqual(namespaceRedisCommands(commands, "preview-dev:")[0], ["GET", "preview-dev:room:one"]);
  assert.deepEqual(namespaceRedisCommands(commands, ""), commands);
});

test("複数のIntegration Redis URLがあれば誤接続防止で停止する", () => {
  assert.throws(() => resolveSocketRedisUrl({
    devredis_REDIS_URL: "rediss://development.test:6379",
    production_REDIS_URL: "rediss://production.test:6379",
  }), /REDIS_STORE_URL_AMBIGUOUS/);
});
