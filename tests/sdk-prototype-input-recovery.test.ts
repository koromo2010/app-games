import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_PUBLISH_MOCK_SOURCE_PATHS,
  recoverPublishMockInputFiles,
} from "../apps/sdk-portal/lib/prototype-input-recovery.ts";

function source(root = "source") {
  return Object.fromEntries(REQUIRED_PUBLISH_MOCK_SOURCE_PATHS.map((path) => [
    `${root}/${path.slice("source/".length)}`,
    `export const ${path.slice("source/".length).replace(/[^a-z]/g, "")} = true;`,
  ]));
}

test("canonical map remains unchanged and starter src root is recovered losslessly", () => {
  const canonical = recoverPublishMockInputFiles(source());
  assert.equal(canonical.repaired, false);
  assert.deepEqual(Object.keys(canonical.files).sort(), [...REQUIRED_PUBLISH_MOCK_SOURCE_PATHS].sort());

  const recovered = recoverPublishMockInputFiles(source("src"));
  assert.equal(recovered.repaired, true);
  assert.deepEqual(recovered.files, canonical.files);
});

test("path/content array is recovered in the same input without duplicate ambiguity", () => {
  const files = Object.entries(source()).map(([path, content]) => ({ path, content, encoding: "utf-8" }));
  const recovered = recoverPublishMockInputFiles(files);
  assert.equal(recovered.repaired, true);
  assert.equal(recovered.files["source/app-set.ts"], source()["source/app-set.ts"]);

  assert.throws(() => recoverPublishMockInputFiles([
    ...files,
    { path: "source/app-set.ts", content: "different" },
  ]), /SDK_PROTOTYPE_INPUT_INVALID/);
});

test("missing, empty, ambiguous, and non-UTF8 source stays fail-closed", () => {
  const missing = source();
  delete missing["source/contracts.ts"];
  assert.throws(() => recoverPublishMockInputFiles(missing), /SDK_PROTOTYPE_INPUT_INVALID/);

  const conflict = { ...source(), "src/app-set.ts": "different" };
  assert.throws(() => recoverPublishMockInputFiles(conflict), /SDK_PROTOTYPE_INPUT_INVALID/);
  assert.throws(() => recoverPublishMockInputFiles([{ path: "source/app-set.ts", content: "x", encoding: "base64" }]), /SDK_PROTOTYPE_INPUT_INVALID/);
});
