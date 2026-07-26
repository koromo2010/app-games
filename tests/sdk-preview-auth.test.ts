import assert from "node:assert/strict";
import test from "node:test";
import {
  createSdkPreviewToken,
  createSdkServiceAuthorization,
  verifySdkPreviewToken,
  verifySdkServiceAuthorization,
} from "../packages/sdk-preview-auth/src/index.ts";
import {
  createPackageRuntimeAccess,
} from "../apps/sdk-portal/lib/preview-links.ts";
import {
  verifyPortalPreviewGrant,
} from "../apps/sdk-preview/lib/preview-grant-verifier.ts";

const secret = "sdk-preview-test-secret-with-at-least-32-bytes";
const grant = {
  version: 3 as const,
  audience: "package-server" as const,
  environment: "development" as const,
  channel: "development" as const,
  role: "runner" as const,
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

test("SDK preview token keeps adopted development and main channels distinct", () => {
  const developmentGrant = { ...grant, channel: "development" as const };
  assert.deepEqual(
    verifySdkPreviewToken(
      createSdkPreviewToken(developmentGrant, secret),
      secret,
      1_999,
    ),
    developmentGrant,
  );
  assert.notDeepEqual(developmentGrant, { ...developmentGrant, channel: "main" });
  assert.throws(() => createSdkPreviewToken({
    ...developmentGrant,
    channel: "main",
  }, secret));
  assert.throws(() => createSdkPreviewToken({
    ...developmentGrant,
    environment: "production",
  }, secret));
  const mainGrant = {
    ...developmentGrant,
    environment: "production" as const,
    channel: "main" as const,
  };
  assert.deepEqual(
    verifySdkPreviewToken(createSdkPreviewToken(mainGrant, secret), secret, 1_999),
    mainGrant,
  );
});

test("main runtime access stays production-scoped when requested from develop", () => {
  const previousSecret = process.env.SDK_PREVIEW_SIGNING_SECRET;
  const previousRef = process.env.VERCEL_GIT_COMMIT_REF;
  const previousBaseUrl = process.env.SDK_PREVIEW_BASE_URL;
  process.env.SDK_PREVIEW_SIGNING_SECRET = secret;
  process.env.VERCEL_GIT_COMMIT_REF = "develop";
  process.env.SDK_PREVIEW_BASE_URL = "https://preview-dev.example";
  try {
    const access = createPackageRuntimeAccess({
      instanceId: grant.instanceId,
      gameId: grant.gameId,
      revision: grant.revision,
      serverBundleSha256: grant.bundleSha256,
      channel: "main",
      now: 1_000,
    });
    assert.match(access.serverRuntimeUrl, /^https:\/\/preview\.game-fields\.com\//);
    const runtimeGrant = verifySdkPreviewToken(
      access.serverRuntimeToken,
      secret,
      1_001,
    );
    assert.equal(runtimeGrant?.environment, "production");
    assert.equal(runtimeGrant?.channel, "main");
  } finally {
    if (previousSecret === undefined) delete process.env.SDK_PREVIEW_SIGNING_SECRET;
    else process.env.SDK_PREVIEW_SIGNING_SECRET = previousSecret;
    if (previousRef === undefined) delete process.env.VERCEL_GIT_COMMIT_REF;
    else process.env.VERCEL_GIT_COMMIT_REF = previousRef;
    if (previousBaseUrl === undefined) delete process.env.SDK_PREVIEW_BASE_URL;
    else process.env.SDK_PREVIEW_BASE_URL = previousBaseUrl;
  }
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
    role: "client",
  }, secret));
  const clientGrant = {
    version: 3 as const,
    audience: "package-client" as const,
    environment: "development" as const,
    channel: "candidate-preview" as const,
    role: "client" as const,
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

test("isolated preview delegates grant verification to the issuing portal", async () => {
  const portalSecret = "portal-only-signing-secret-with-at-least-32-bytes";
  const previewLocalSecret = "different-preview-local-secret-over-32-bytes";
  const mainGrant = {
    ...grant,
    environment: "production" as const,
    channel: "main" as const,
    expiresAt: 20_000,
  };
  const token = createSdkPreviewToken(mainGrant, portalSecret);
  const verified = await verifyPortalPreviewGrant(token, {
    env: {
      VERCEL_GIT_COMMIT_REF: "main",
      SDK_PREVIEW_SIGNING_SECRET: previewLocalSecret,
    },
    now: 10_000,
    fetchVerifier: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as { token?: unknown };
      const remoteGrant = typeof request.token === "string"
        ? verifySdkPreviewToken(request.token, portalSecret, 10_000)
        : null;
      return remoteGrant
        ? Response.json({ grant: remoteGrant })
        : Response.json({ error: "PREVIEW_TOKEN_INVALID" }, { status: 403 });
    },
  });

  assert.deepEqual(verified, mainGrant);
});

test("isolated preview rejects invalid portal responses and unavailable verifier", async () => {
  assert.equal(await verifyPortalPreviewGrant("invalid-token", {
    fetchVerifier: async () => Response.json(
      { error: "PREVIEW_TOKEN_INVALID" },
      { status: 403 },
    ),
  }), null);
  await assert.rejects(
    verifyPortalPreviewGrant("token.with-signature", {
      fetchVerifier: async () => Response.json({ grant: { version: 3 } }),
    }),
    /SDK_PREVIEW_GRANT_VERIFIER_INVALID/,
  );
  await assert.rejects(
    verifyPortalPreviewGrant("token.with-signature", {
      fetchVerifier: async () => {
        throw new Error("network detail must not escape");
      },
    }),
    /SDK_PREVIEW_GRANT_VERIFIER_UNAVAILABLE/,
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
