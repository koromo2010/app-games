import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { recordPrototypeBuildFailure } from "../apps/sdk-portal/lib/prototype-build-observability.ts";
import {
  createPrototypeBuildInputFingerprint,
  PrototypeBuildError,
} from "../apps/sdk-portal/lib/prototype-builder-diagnostics.ts";
import { buildSdkToolErrorResult } from "../apps/sdk-portal/lib/sdk-tool-error-contract.ts";

const fixtureRoot = "tests/fixtures/t114-publish-mock-v003";

function fixtureFingerprint() {
  const publishInput = JSON.parse(readFileSync(`${fixtureRoot}/publish-input.json`, "utf8"));
  const files = Object.fromEntries(Object.entries(publishInput.files).map(([key, relativePath]) => [
    key,
    readFileSync(`${fixtureRoot}/${relativePath}`, "utf8"),
  ]));
  return createPrototypeBuildInputFingerprint({
    manifest: JSON.parse(readFileSync(`${fixtureRoot}/manifest.json`, "utf8")),
    files,
    moduleUsage: JSON.parse(readFileSync(`${fixtureRoot}/module-usage.json`, "utf8")),
    moduleBinding: JSON.parse(readFileSync(`${fixtureRoot}/profile-binding.json`, "utf8")),
  });
}

test("prototype input fingerprint is deterministic and contains hashes rather than source", () => {
  const first = fixtureFingerprint();
  const second = fixtureFingerprint();
  assert.deepEqual(first, second);
  for (const [key, value] of Object.entries(first)) {
    if (key.endsWith("Sha256")) assert.match(String(value), /^[a-f0-9]{64}$/, key);
  }
  assert.equal(first.fileCount, 10);
  assert.equal(first.sourceFileCount, 6);
  assert.equal(first.totalUtf8BytesBucket, "0-64KiB");
  assert.doesNotMatch(JSON.stringify(first), /じゃんけん|source\/app-set\.ts/);
});

test("prototype build telemetry emits only the closed safe failure contract", () => {
  const lines: string[] = [];
  const original = console.error;
  const previousCommit = process.env.VERCEL_GIT_COMMIT_SHA;
  const previousTree = process.env.GAME_FIELDS_SOURCE_TREE_SHA;
  process.env.VERCEL_GIT_COMMIT_SHA = "a".repeat(40);
  process.env.GAME_FIELDS_SOURCE_TREE_SHA = "not-a-git-tree-secret";
  console.error = (value?: unknown) => { lines.push(String(value)); };
  try {
    recordPrototypeBuildFailure({
      correlationId: "pmk-22222222222222222222",
      error: new PrototypeBuildError({
        code: "DEPENDENCY_UNAVAILABLE",
        stage: "dependency-resolution",
        dependencyClass: "game-sdk",
      }),
      builderIdentity: "b".repeat(64),
      inputFingerprint: fixtureFingerprint(),
    });
  } finally {
    console.error = original;
    if (previousCommit === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = previousCommit;
    if (previousTree === undefined) delete process.env.GAME_FIELDS_SOURCE_TREE_SHA;
    else process.env.GAME_FIELDS_SOURCE_TREE_SHA = previousTree;
  }
  assert.equal(lines.length, 1);
  const event = JSON.parse(lines[0]);
  assert.equal(event.event, "sdk.prototype-build");
  assert.equal(event.fields.buildFailureCode, "DEPENDENCY_UNAVAILABLE");
  assert.equal(event.fields.buildStage, "dependency-resolution");
  assert.equal(event.fields.retryable, false);
  assert.equal(event.fields.sourceCommit, "a".repeat(40));
  assert.equal(event.fields.sourceTree, "NOT_OBSERVED");
  assert.doesNotMatch(lines[0], /not-a-git-tree-secret|Cookie|playerId|accountRef|じゃんけん/);
});

test("MCP error result preserves the old code and adds safe build diagnostics", () => {
  const result = buildSdkToolErrorResult({
    code: "SDK_PROTOTYPE_BUILD_FAILED",
    message: "prototype build failed.",
    layer: "validation",
    correlationId: "pmk-33333333333333333333",
    operation: "prototype-build",
    buildStage: "dependency-resolution",
    buildFailureCode: "DEPENDENCY_UNAVAILABLE",
    retryable: false,
    builderIdentity: "c".repeat(64),
  });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.code, "SDK_PROTOTYPE_BUILD_FAILED");
  assert.equal(result.structuredContent.error.buildFailureCode, "DEPENDENCY_UNAVAILABLE");
  assert.equal(result.structuredContent.error.retryable, false);

  const routeSource = readFileSync("apps/sdk-portal/app/api/mcp/route.ts", "utf8");
  assert.match(routeSource, /buildStage: error\.buildStage/);
  assert.match(routeSource, /buildFailureCode: error\.buildFailureCode/);
  assert.match(routeSource, /retryable: false as const/);
});

test("SDK Portal health exposes a bounded builder preflight without fixture source", () => {
  const source = readFileSync("apps/sdk-portal/app/api/health/route.ts", "utf8");
  assert.match(source, /probePrototypeBuilderRuntime/);
  assert.match(source, /prototypeBuilder: prototypeBuilder\.prototypeBuilder/);
  assert.match(source, /SDK_PROTOTYPE_BUILDER_UNAVAILABLE/);
  assert.doesNotMatch(source, /t114-publish-mock|publishMockPipeline/);
});
