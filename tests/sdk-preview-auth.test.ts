import assert from "node:assert/strict";
import test from "node:test";
import { createSdkPreviewToken, verifySdkPreviewToken } from "../packages/sdk-preview-auth/src/index.ts";

const secret = "sdk-preview-test-secret-with-at-least-32-bytes";
const grant = {
  version: 1 as const,
  instanceId: "creator-lab",
  gameId: "sample-game",
  revision: "a".repeat(40),
  expiresAt: 2_000,
};

test("SDK preview token accepts only the signed immutable scope before expiry", () => {
  const token = createSdkPreviewToken(grant, secret);
  assert.deepEqual(verifySdkPreviewToken(token, secret, 1_999), grant);
  assert.equal(verifySdkPreviewToken(token, secret, 2_000), null);
  assert.equal(verifySdkPreviewToken(`${token.slice(0, -1)}x`, secret, 1_000), null);
});

test("SDK preview token rejects invalid identifiers and weak secrets", () => {
  assert.throws(() => createSdkPreviewToken({ ...grant, instanceId: "../admin" }, secret));
  assert.throws(() => createSdkPreviewToken(grant, "too-short"));
});
