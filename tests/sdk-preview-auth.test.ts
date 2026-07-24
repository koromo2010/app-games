import assert from "node:assert/strict";
import test from "node:test";
import {
  createSdkPreviewToken,
  createSdkServiceAuthorization,
  verifySdkPreviewToken,
  verifySdkServiceAuthorization,
} from "../packages/sdk-preview-auth/src/index.ts";

const secret = "sdk-preview-test-secret-with-at-least-32-bytes";
const grant = {
  version: 2 as const,
  audience: "package-server" as const,
  instanceId: "creator-lab",
  gameId: "sample-game",
  revision: "a".repeat(40),
  bundleSha256: "b".repeat(64),
  expiresAt: 2_000,
};

test("SDK preview token accepts only the signed immutable scope before expiry", () => {
  const token = createSdkPreviewToken(grant, secret);
  assert.deepEqual(verifySdkPreviewToken(token, secret, 1_999), grant);
  assert.equal(verifySdkPreviewToken(token, secret, 2_000), null);
  const replacement = token.endsWith("a") ? "b" : "a";
  assert.equal(verifySdkPreviewToken(`${token.slice(0, -1)}${replacement}`, secret, 1_000), null);
});

test("SDK preview token rejects invalid identifiers and weak secrets", () => {
  assert.throws(() => createSdkPreviewToken({ ...grant, instanceId: "../admin" }, secret));
  assert.throws(() => createSdkPreviewToken(grant, "too-short"));
});

test("SDK preview token binds client and server audiences with a bundle hash", () => {
  assert.throws(() => createSdkPreviewToken({
    ...grant,
    bundleSha256: undefined,
  }, secret));
  assert.throws(() => createSdkPreviewToken({
    ...grant,
    audience: "package-client",
  }, secret));
  const clientGrant = {
    version: 2 as const,
    audience: "package-client" as const,
    instanceId: grant.instanceId,
    gameId: grant.gameId,
    revision: grant.revision,
    expiresAt: grant.expiresAt,
  };
  assert.deepEqual(
    verifySdkPreviewToken(createSdkPreviewToken(clientGrant, secret), secret, 1_999),
    clientGrant,
  );
});

test("SDK service authorization binds method and path within a short window", () => {
  const authorization = createSdkServiceAuthorization({
    method: "post",
    path: "/api/internal/promotions",
    now: 10_000,
  }, secret);
  assert.equal(verifySdkServiceAuthorization(authorization, {
    method: "POST",
    path: "/api/internal/promotions",
    now: 70_000,
  }, secret), true);
  assert.equal(verifySdkServiceAuthorization(authorization, {
    method: "GET",
    path: "/api/internal/promotions",
    now: 10_000,
  }, secret), false);
  assert.equal(verifySdkServiceAuthorization(authorization, {
    method: "POST",
    path: "/api/runtime-catalog",
    now: 10_000,
  }, secret), false);
  assert.equal(verifySdkServiceAuthorization(authorization, {
    method: "POST",
    path: "/api/internal/promotions",
    now: 70_001,
  }, secret), false);
  assert.equal(verifySdkServiceAuthorization(
    `${authorization.slice(0, -1)}x`,
    {
      method: "POST",
      path: "/api/internal/promotions",
      now: 10_000,
    },
    secret,
  ), false);
});
