import assert from "node:assert/strict";
import test from "node:test";
import { prepareMockUploadFiles } from "../apps/sdk-portal/lib/mock-git-store.ts";

const validFiles = [
  { path: "index.html", content: "<!doctype html>", encoding: "utf-8" },
  { path: "styles.css", content: "body{}", encoding: "utf-8" },
  { path: "mock.js", content: "void 0", encoding: "utf-8" },
] as const;

test("SDK mock upload accepts a complete text mock", () => {
  const files = prepareMockUploadFiles(validFiles);
  assert.equal(files.length, 3);
  assert.equal(files[0].bytes, Buffer.byteLength(validFiles[0].content));
});

test("SDK MCP mock upload accepts the documented path-to-content map", () => {
  const files = prepareMockUploadFiles({
    "index.html": "<!doctype html>",
    "styles.css": "body{}",
    "mock.js": "void 0",
    "preview.json": JSON.stringify({ gameId: "sample-game" }),
  });
  assert.deepEqual(
    files.map(({ path, encoding }) => ({ path, encoding })),
    [
      { path: "index.html", encoding: "utf-8" },
      { path: "styles.css", encoding: "utf-8" },
      { path: "mock.js", encoding: "utf-8" },
      { path: "preview.json", encoding: "utf-8" },
    ],
  );
});

test("SDK mock upload rejects traversal, duplicates, and incomplete mocks", () => {
  assert.throws(() => prepareMockUploadFiles(validFiles.slice(0, 2)), /missing mock.js/);
  assert.throws(() => prepareMockUploadFiles([...validFiles, { path: "../secret.js", content: "x" }]), /path is invalid/);
  assert.throws(() => prepareMockUploadFiles([...validFiles, validFiles[0]]), /path is invalid/);
  assert.throws(
    () => prepareMockUploadFiles({ "index.html": "<!doctype html>", "styles.css": "body{}", "mock.js": 1 }),
    /file is invalid/,
  );
});
