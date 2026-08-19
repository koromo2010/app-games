import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  createSdkPreviewToken,
  sdkPreviewPublicKey,
  verifySdkPreviewToken,
} from "../packages/sdk-preview-auth/src/index.ts";
import {
  createSdkServiceAuthorization,
  verifySdkServiceAuthorization,
} from "../packages/sdk-service-auth/src/index.ts";
import {
  createPackageRuntimeAccess,
} from "../apps/sdk-portal/lib/preview-links.ts";
import {
  resetPreviewPublicKeyCacheForTests,
  verifyPortalPreviewGrant,
} from "../apps/sdk-preview/lib/preview-grant-verifier.ts";
import {
  previewExchangeContentSecurityPolicy,
} from "../apps/sdk-preview/lib/preview-security.ts";
import { GAME_SDK_IFRAME_SANDBOX } from "../app/components/game-sdk/game-sdk-iframe-sandbox.ts";

const secret = "sdk-preview-test-secret-with-at-least-32-bytes";
const grant = {
  version: 4 as const,
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
  const publicKey = sdkPreviewPublicKey(secret);
  const token = createSdkPreviewToken(grant, secret);
  assert.deepEqual(verifySdkPreviewToken(token, publicKey, 1_999), grant);
  assert.equal(verifySdkPreviewToken(token, publicKey, 2_000), null);
  const replacement = token.endsWith("a") ? "b" : "a";
  assert.equal(
    verifySdkPreviewToken(
      `${token.slice(0, -1)}${replacement}`,
      publicKey,
      1_000,
    ),
    null,
  );
  assert.equal(
    verifySdkPreviewToken(
      token,
      sdkPreviewPublicKey("another-signing-secret-with-at-least-32-bytes"),
      1_000,
    ),
    null,
  );
});

test("SDK preview token keeps adopted development and main channels distinct", () => {
  const publicKey = sdkPreviewPublicKey(secret);
  const developmentGrant = { ...grant, channel: "development" as const };
  assert.deepEqual(
    verifySdkPreviewToken(
      createSdkPreviewToken(developmentGrant, secret),
      publicKey,
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
    verifySdkPreviewToken(
      createSdkPreviewToken(mainGrant, secret),
      publicKey,
      1_999,
    ),
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
      sdkPreviewPublicKey(secret),
      1_001,
    );
    assert.equal(runtimeGrant?.environment, "production");
    assert.equal(runtimeGrant?.channel, "main");
    assert.doesNotMatch(access.clientRuntimeUrl, /\?token=/);
    assert.match(access.clientRuntimeUrl, /#token=gfsp4\./);
    const clientToken = new URL(access.clientRuntimeUrl).hash.slice("#token=".length);
    const clientGrant = verifySdkPreviewToken(
      decodeURIComponent(clientToken),
      sdkPreviewPublicKey(secret),
      1_001,
    );
    assert.equal(clientGrant?.expiresAt, 61_000);
    assert.equal(runtimeGrant?.expiresAt, 601_000);
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
    version: 4 as const,
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
    verifySdkPreviewToken(
      createSdkPreviewToken(clientGrant, secret),
      sdkPreviewPublicKey(secret),
      1_999,
    ),
    clientGrant,
  );
});

test("isolated preview verifies the issuer with only its Ed25519 public key", async () => {
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
      NODE_ENV: "test",
      VERCEL_GIT_COMMIT_REF: "main",
      SDK_PREVIEW_SIGNING_SECRET: previewLocalSecret,
    },
    now: 10_000,
    publicKey: sdkPreviewPublicKey(portalSecret),
  });

  assert.deepEqual(verified, mainGrant);
});

test("isolated preview obtains only a cacheable public key during key rollout", async () => {
  resetPreviewPublicKeyCacheForTests();
  const portalSecret = "portal-rollout-secret-with-at-least-32-bytes";
  const publicKey = sdkPreviewPublicKey(portalSecret);
  const token = createSdkPreviewToken({
    ...grant,
    expiresAt: 20_000,
  }, portalSecret);
  let fetchCount = 0;
  const fetchPublicKey = async () => {
    fetchCount += 1;
    return Response.json({
      algorithm: "Ed25519",
      environment: "development",
      publicKey,
      version: 4,
    });
  };
  assert.deepEqual(await verifyPortalPreviewGrant(token, {
    env: { NODE_ENV: "test", VERCEL_GIT_COMMIT_REF: "develop" },
    fetchPublicKey,
    now: 10_000,
  }), { ...grant, expiresAt: 20_000 });
  assert.deepEqual(await verifyPortalPreviewGrant(token, {
    env: { NODE_ENV: "test", VERCEL_GIT_COMMIT_REF: "develop" },
    fetchPublicKey,
    now: 10_000,
  }), { ...grant, expiresAt: 20_000 });
  assert.equal(fetchCount, 1);
});

test("production preview uses its pinned public key without runtime discovery", async () => {
  let fetchCount = 0;
  assert.equal(await verifyPortalPreviewGrant("invalid-token", {
    env: { NODE_ENV: "test", VERCEL_GIT_COMMIT_REF: "main" },
    fetchPublicKey: async () => {
      fetchCount += 1;
      throw new Error("production must not fetch the Portal public key");
    },
  }), null);
  assert.equal(fetchCount, 0);
});

test("isolated preview rejects invalid public keys and unavailable key discovery", async () => {
  resetPreviewPublicKeyCacheForTests();
  assert.equal(await verifyPortalPreviewGrant("invalid-token", {
    publicKey: sdkPreviewPublicKey(secret),
  }), null);
  await assert.rejects(
    verifyPortalPreviewGrant("token.with-signature", {
      env: { NODE_ENV: "test", VERCEL_GIT_COMMIT_REF: "develop" },
      fetchPublicKey: async () => Response.json({
        algorithm: "Ed25519",
        environment: "development",
        publicKey: "invalid",
        version: 4,
      }),
    }),
    /SDK_PREVIEW_PUBLIC_KEY_INVALID/,
  );
  resetPreviewPublicKeyCacheForTests();
  await assert.rejects(
    verifyPortalPreviewGrant("token.with-signature", {
      env: { NODE_ENV: "test", VERCEL_GIT_COMMIT_REF: "develop" },
      fetchPublicKey: async () => {
        throw new Error("network detail must not escape");
      },
    }),
    /SDK_PREVIEW_PUBLIC_KEY_UNAVAILABLE/,
  );
});

test("client grants use a sandbox-safe fragment form exchange and never query credentials", () => {
  const exchangeSource = readFileSync(
    "apps/sdk-preview/lib/preview-exchange.ts",
    "utf8",
  );
  assert.match(exchangeSource, /location\.hash/);
  assert.match(
    exchangeSource,
    /history\.replaceState\(null, "", location\.pathname\)/,
  );
  assert.match(exchangeSource, /form\.method = "POST"/);
  assert.match(exchangeSource, /form\.action = location\.origin \+ location\.pathname/);
  assert.match(exchangeSource, /form\.enctype = "application\/x-www-form-urlencoded"/);
  assert.match(exchangeSource, /form\.submit\(\)/);
  assert.match(exchangeSource, /createHash\("sha256"\)/);
  assert.doesNotMatch(exchangeSource, /\bfetch\(/);
  assert.match(exchangeSource, /contentType !== "application\/x-www-form-urlencoded"/);
  assert.match(exchangeSource, /payload\.getAll\("token"\)/);
  assert.match(exchangeSource, /MAX_EXCHANGE_REQUEST_BYTES/);
  assert.match(exchangeSource, /"Referrer-Policy": "no-referrer"/);
  assert.doesNotMatch(exchangeSource, /document\.cookie/);

  // GameSdkFrame.tsx's iframe now goes through the shared <GameSdkIframe>
  // component (app/components/game-sdk/GameSdkIframe.tsx,
  // app/components/game-sdk/GameSdkIframeBridge.tsx) instead of a literal
  // `<iframe sandbox="...">`, so the sandbox guarantee for that side is
  // checked against the single source of truth constant rather than a
  // regex over GameSdkFrame.tsx's source. GameSdkIframe.tsx itself has JSX
  // in its body and can't be imported by this plain-Node test runner, so the
  // constant lives in the JSX-free game-sdk-iframe-sandbox.ts, which
  // GameSdkIframe.tsx re-exports for app code.
  assert.equal(
    GAME_SDK_IFRAME_SANDBOX,
    "allow-scripts allow-forms allow-modals allow-pointer-lock",
  );
  assert.doesNotMatch(GAME_SDK_IFRAME_SANDBOX, /allow-same-origin/);
  assert.match(
    readFileSync("app/components/game-sdk/GameSdkIframeBridge.tsx", "utf8"),
    /<GameSdkIframe\b/,
  );
  assert.doesNotMatch(
    readFileSync("app/components/GameSdkFrame.tsx", "utf8"),
    /<iframe\b/,
  );

  // SdkPreviewGameShell.tsx is untouched by the GameSdkFrame.tsx split — it
  // still writes its own literal `<iframe sandbox="...">`, so keep checking
  // it the original way.
  const sdkPreviewGameShellSource = readFileSync(
    "app/sdk-preview/[creatorSlug]/games/[gameId]/SdkPreviewGameShell.tsx",
    "utf8",
  );
  assert.match(
    sdkPreviewGameShellSource,
    /sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock"/,
  );
  assert.doesNotMatch(sdkPreviewGameShellSource, /sandbox="[^"]*allow-same-origin/);

  for (const path of [
    "apps/sdk-preview/app/open/[instanceId]/[gameId]/[revision]/route.ts",
    "apps/sdk-preview/app/package-open/[instanceId]/[gameId]/[revision]/route.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /searchParams\.get\(["']token["']\)/);
    assert.match(source, /renderAuthorizedPreviewDocument/);
    assert.doesNotMatch(source, /\bcookies?\b/i);
    assert.doesNotMatch(source, /NextResponse\.redirect/);
    assert.doesNotMatch(source, /Set-Cookie/i);
  }
  const documentSource = readFileSync(
    "apps/sdk-preview/lib/preview-document.ts",
    "utf8",
  );
  assert.match(documentSource, /fetchPreviewAsset/);
  assert.match(documentSource, /createPreviewAssetToken/);
  assert.match(documentSource, /injectGameFieldsPackageClient/);
  assert.match(documentSource, /injectGameFieldsPreset/);
  assert.match(documentSource, /new Response\(responseContent/);
  assert.doesNotMatch(documentSource, /\bcookies?\b/i);
  assert.doesNotMatch(documentSource, /Set-Cookie/i);
  assert.equal(
    existsSync("apps/sdk-portal/app/api/preview-token/verify/route.ts"),
    false,
  );
});

test("preview exchange permits only its exact form target and keeps fetch disabled", () => {
  const csp = previewExchangeContentSecurityPolicy(
    "https://preview.example",
    "sha256-dGVzdA==",
  );
  assert.match(csp, /form-action https:\/\/preview\.example/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /script-src 'sha256-dGVzdA=='/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.doesNotMatch(csp, /allow-same-origin/);
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

test("SDK service authorization signs the expected support environment", () => {
  const authorization = createSdkServiceAuthorization({
    method: "GET",
    path: "/api/internal/sdk-support?playerId=player-test",
    environment: "development",
    now: 10_000,
  }, secret);
  assert.equal(verifySdkServiceAuthorization(authorization, {
    method: "GET",
    path: "/api/internal/sdk-support?playerId=player-test",
    environment: "development",
    now: 10_000,
  }, secret), true);
  assert.equal(verifySdkServiceAuthorization(authorization, {
    method: "GET",
    path: "/api/internal/sdk-support?playerId=player-test",
    environment: "production",
    now: 10_000,
  }, secret), false);
  assert.equal(verifySdkServiceAuthorization(authorization, {
    method: "GET",
    path: "/api/internal/sdk-support?playerId=player-test",
    now: 10_000,
  }, secret), true);
});

test("Preview grant and service HMAC packages have disjoint responsibilities", () => {
  const previewAuth = readFileSync("packages/sdk-preview-auth/src/index.ts", "utf8");
  const serviceAuth = readFileSync("packages/sdk-service-auth/src/index.ts", "utf8");
  assert.doesNotMatch(previewAuth, /SdkService|createHmac|timingSafeEqual|SDK_ACCOUNT_LINK_SECRET/);
  assert.doesNotMatch(serviceAuth, /SdkPreview|Ed25519|createPrivateKey|createPublicKey|\bsign\(|\bverify\(/);
  const previewFiles = [
    "apps/sdk-preview/package.json",
    "apps/sdk-preview/next.config.ts",
    "apps/sdk-preview/lib/preview-source.ts",
    "apps/sdk-preview/app/server/[instanceId]/[gameId]/[revision]/route.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(previewFiles, /SDK_ACCOUNT_LINK_SECRET|@game-fields\/sdk-service-auth/);
  assert.match(readFileSync("lib/sdk-service-auth.ts", "utf8"), /@game-fields\/sdk-service-auth/);
  assert.match(readFileSync("apps/sdk-portal/lib/sdk-service-auth.ts", "utf8"), /@game-fields\/sdk-service-auth/);
});
