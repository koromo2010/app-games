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

test("SDK mock upload rejects traversal, duplicates, and incomplete mocks", () => {
  assert.throws(() => prepareMockUploadFiles(validFiles.slice(0, 2)), /missing mock.js/);
  assert.throws(() => prepareMockUploadFiles([...validFiles, { path: "../secret.js", content: "x" }]), /path is invalid/);
  assert.throws(() => prepareMockUploadFiles([...validFiles, validFiles[0]]), /path is invalid/);
});
