import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { writeImmutableJson } from "../scripts/write-immutable-json.mjs";

test("writes JSON through an immutable temporary-file publication and reads it back", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "immutable-json-"));
  const destination = path.join(directory, "capture.json");
  const value = { status: "ok", nested: { count: 2 }, values: [1, 2] };

  try {
    const result = await writeImmutableJson(destination, value);
    assert.equal(result.destination, destination);
    assert.match(result.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(JSON.parse(await readFile(destination, "utf8")), value);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not overwrite an existing destination", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "immutable-json-"));
  const destination = path.join(directory, "capture.json");

  try {
    await writeFile(destination, "original", "utf8");
    await assert.rejects(
      writeImmutableJson(destination, { status: "replacement" }),
      /IMMUTABLE_DESTINATION_EXISTS/,
    );
    assert.equal(await readFile(destination, "utf8"), "original");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects invalid JSON before creating the destination", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "immutable-json-"));
  const destination = path.join(directory, "capture.json");

  try {
    await assert.rejects(writeImmutableJson(destination, "{not-json"), SyntaxError);
    await assert.rejects(readFile(destination), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects known secret-bearing fields before creating the destination", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "immutable-json-"));
  const destination = path.join(directory, "capture.json");

  try {
    await assert.rejects(
      writeImmutableJson(destination, {
        structuredContent: { environmentBinding: "must-not-persist" },
      }),
      /SENSITIVE_FIELD_PRESENT: \$\.structuredContent\.environmentBinding/,
    );
    await assert.rejects(readFile(destination), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
