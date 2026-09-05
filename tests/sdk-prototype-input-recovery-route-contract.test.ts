import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("apps/sdk-portal/app/api/mcp/route.ts", "utf8");

test("publish_mock re-reads the established contract before lossless input recovery", () => {
  const branch = route.slice(route.indexOf('if (name === "publish_mock")'), route.indexOf('if (name === "approve_mock")'));
  assert.ok(branch.indexOf("requireEstablishedCreatorGameModuleContract") < branch.indexOf("recoverPublishMockInputFiles"));
  assert.match(branch, /const recovery = recoverPublishMockInputFiles\(args\.files\)/);
  assert.match(branch, /validateGameSdkModuleUsage\(\{[\s\S]*files,/);
  assert.match(branch, /if \(recovery\.repaired\) return respond\(confirmation\)/);
  assert.doesNotMatch(branch, /createCreatorGameDraft|prepareCreatorGameModuleProfileUpdate/);
});
