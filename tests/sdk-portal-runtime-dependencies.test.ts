import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("SDK Portal production imports declare direct runtime dependencies", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-sdk-portal-runtime-dependencies.mjs"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2\/2 linkedom importers covered/);
  assert.match(result.stdout, /1\/1 borrowed runner importer covered/);
  assert.match(result.stdout, /declaration-removal guard PASS/);
});
