import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

type Consumer = {
  id: string;
  source: string;
  gateway: string;
  operations: string[];
  revisionPolicy: string;
};

const root = process.cwd();

async function source(pathname: string) {
  return readFile(path.join(root, pathname), "utf8");
}

test("runner consumer registry covers every shared owner boundary", async () => {
  const registry = JSON.parse(
    await source("config/game-sdk-runner-consumers.json"),
  ) as { schemaVersion: number; owner: string; consumers: Consumer[] };
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.owner, "lib/game-sdk-runner-client.ts");
  assert.deepEqual(
    registry.consumers.map(({ id }) => id).sort(),
    [
      "app-release-manifest-verifier",
      "approved-active-room-fixed-revision",
      "approved-current-runtime",
      "creator-candidate-package-preview",
      "package-promotion-manifest-verifier",
    ],
  );

  for (const consumer of registry.consumers) {
    assert.match(consumer.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(consumer.operations.length > 0, consumer.id);
    assert.match(consumer.revisionPolicy, /exact$/);
    const consumerSource = await source(consumer.source);
    const gatewayImport = consumer.gateway === "lib/game-sdk-remote-module.ts"
      ? "createGameSdkRemoteServerModule"
      : "invokeGameSdkRunner";
    assert.match(consumerSource, new RegExp(gatewayImport), consumer.id);
  }
});

test("all direct server runtime POSTs use the shared runner owner", async () => {
  const registry = JSON.parse(
    await source("config/game-sdk-runner-consumers.json"),
  ) as { consumers: Consumer[] };
  const candidates = [...new Set(registry.consumers
    .filter(({ gateway }) => gateway === "lib/game-sdk-runner-client.ts")
    .map(({ source: pathname }) => pathname)
    .concat("lib/game-sdk-remote-module.ts"))];
  for (const pathname of candidates) {
    const text = await source(pathname);
    assert.match(text, /invokeGameSdkRunner\(/, pathname);
    assert.doesNotMatch(
      text,
      /fetch\(access\.serverRuntimeUrl|fetchRunnerResponse\(/,
      pathname,
    );
  }
});

test("common recovery implementation contains no game-specific exception", async () => {
  const sharedSources = [
    "lib/game-sdk-runner-client.ts",
    "lib/game-sdk-remote-module.ts",
  ];
  for (const pathname of sharedSources) {
    assert.doesNotMatch(
      await source(pathname),
      /ai-word-guess|test10-1/i,
      pathname,
    );
  }
});
