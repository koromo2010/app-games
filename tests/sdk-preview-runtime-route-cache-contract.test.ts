import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  "apps/sdk-preview/app/server/[instanceId]/[gameId]/[revision]/route.ts",
  "utf8",
);

test("Preview server route authenticates before exact cache resolution and never exposes cache payload", () => {
  assert.ok(route.indexOf("serverRuntimeAuthFailure") < route.indexOf("sdkPreviewRuntimeArtifactCache.resolve"));
  assert.ok(route.indexOf("expectedBundleSha256 = grant.bundleSha256") < route.indexOf("sdkPreviewRuntimeArtifactCache.resolve"));
  assert.equal((route.match(/fetchPreviewAsset\s*\(/g) ?? []).length, 1);
  assert.match(route, /X-Game-Sdk-Artifact-Cache/);
  assert.match(route, /Cache-Control.*private, no-store/);
  assert.doesNotMatch(route, /createHash|digest\("hex"\)/);
  assert.match(route, /runGameSdkPortableServer/);
  assert.match(route, /runGameSdkPortableCommandBatch/);
});
