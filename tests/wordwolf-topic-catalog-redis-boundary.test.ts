import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { namespaceRedisCommand } from "../lib/redis-store.ts";

test("Word Wolf catalogのHSETNX呼出しは共通namespace境界でapp-dev keyになる", () => {
  const source = readFileSync("lib/wordwolf-topic-catalog.ts", "utf8");
  assert.match(source, /\[\s*"HSETNX",\s*catalogKey/);
  assert.deepEqual(
    namespaceRedisCommand(["HSETNX", "wordwolf:topic:catalog:v1", "topic", "payload"], "app-dev:"),
    ["HSETNX", "app-dev:wordwolf:topic:catalog:v1", "topic", "payload"],
  );
});
