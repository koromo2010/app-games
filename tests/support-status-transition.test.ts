import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isSupportThreadStatusTransitionAllowed } from "../lib/support-thread-core.ts";

test("support status transitions keep closed threads terminal", () => {
  assert.equal(isSupportThreadStatusTransitionAllowed("open", "in-progress"), true);
  assert.equal(isSupportThreadStatusTransitionAllowed("in-progress", "waiting-user"), true);
  assert.equal(isSupportThreadStatusTransitionAllowed("waiting-user", "resolved"), true);
  assert.equal(isSupportThreadStatusTransitionAllowed("resolved", "open"), true);
  assert.equal(isSupportThreadStatusTransitionAllowed("closed", "open"), false);
  assert.equal(isSupportThreadStatusTransitionAllowed("closed", "resolved"), false);
});

test("reply approval reuses the draft UUID request ID", () => {
  const source = readFileSync(
    new URL("../lib/user-report-draft-store.ts", import.meta.url),
    "utf8",
  ) as string;
  assert.match(source, /requestId: string;/);
  assert.match(source, /requestId: draft\.requestId/);
  assert.doesNotMatch(source, /requestId: `approved-/);
});
