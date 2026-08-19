import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SdkPreviewGrant } from "@game-fields/sdk-preview-auth";

const PREVIEW_ASSET_TOKEN_AUDIENCE = "game-fields-preview-assets";
const PREVIEW_ASSET_TOKEN_LEGACY_VERSION = 1;
const PREVIEW_ASSET_TOKEN_VERSION = "v2";
const PREVIEW_ASSET_TOKEN_BUCKET_MS = 60 * 60 * 1000;
const PREVIEW_ASSET_TOKEN_LIFETIME_MS = 2 * PREVIEW_ASSET_TOKEN_BUCKET_MS;
const MAX_V2_TOKEN_LENGTH = 256;
const MAX_LEGACY_TOKEN_LENGTH = 2_048;

export type PreviewAssetIdentity = Pick<
  SdkPreviewGrant,
  "instanceId" | "gameId" | "revision"
>;
export type PreviewAssetSourceKind = "mock" | "package";
export type PreviewAssetScope = PreviewAssetIdentity & {
  sourceKind: PreviewAssetSourceKind;
  assetPath: string;
};
export type VerifiedPreviewAssetToken = {
  expiresAt: number;
  version: "v1" | "v2";
};
type LegacyPreviewAssetTokenPayload = PreviewAssetIdentity & {
  audience: typeof PREVIEW_ASSET_TOKEN_AUDIENCE;
  expiresAt: number;
  version: typeof PREVIEW_ASSET_TOKEN_LEGACY_VERSION;
};

export function previewSigningSecret() {
  const secret = process.env.SDK_PREVIEW_SIGNING_SECRET?.trim() ?? "";
  if (!secret) throw new Error("SDK preview signing is not configured.");
  return secret;
}

function previewAssetSignature(
  scope: PreviewAssetScope,
  expiresAt: number,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(JSON.stringify([
      PREVIEW_ASSET_TOKEN_AUDIENCE,
      PREVIEW_ASSET_TOKEN_VERSION,
      scope.sourceKind,
      scope.instanceId,
      scope.gameId,
      scope.revision,
      scope.assetPath,
      expiresAt,
    ]))
    .digest();
}

function legacyPreviewAssetSignature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${PREVIEW_ASSET_TOKEN_AUDIENCE}:${payload}`)
    .digest();
}

function scopedAssetToken(
  scope: PreviewAssetScope,
  expiresAt: number,
  now: number,
  secret: string,
) {
  const maximumExpiry = (
    Math.floor(now / PREVIEW_ASSET_TOKEN_BUCKET_MS)
    * PREVIEW_ASSET_TOKEN_BUCKET_MS
    + PREVIEW_ASSET_TOKEN_LIFETIME_MS
  );
  if (
    !scope.assetPath
    || scope.assetPath.length > 500
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= now
    || expiresAt > maximumExpiry
  ) {
    throw new Error("SDK preview asset scope is invalid.");
  }
  const encodedExpiry = expiresAt.toString(36);
  const signature = previewAssetSignature(scope, expiresAt, secret)
    .toString("base64url");
  return `${PREVIEW_ASSET_TOKEN_VERSION}.${encodedExpiry}.${signature}`;
}

/**
 * Creates a deterministic capability for one browser-readable asset. Tokens
 * issued within the same hour use the same expiry bucket so immutable revision
 * assets keep a stable cache key instead of missing on every iframe reload.
 */
export function createPreviewAssetToken(
  grant: SdkPreviewGrant,
  sourceKind: PreviewAssetSourceKind,
  assetPath: string,
  now = Date.now(),
  secret = previewSigningSecret(),
) {
  const expectedAudience = sourceKind === "package"
    ? "package-client"
    : "mock-client";
  if (
    grant.role !== "client"
    || grant.audience !== expectedAudience
    || grant.expiresAt <= now
  ) {
    throw new Error("SDK preview client grant is invalid.");
  }
  const expiresAt = (
    Math.floor(now / PREVIEW_ASSET_TOKEN_BUCKET_MS)
    * PREVIEW_ASSET_TOKEN_BUCKET_MS
    + PREVIEW_ASSET_TOKEN_LIFETIME_MS
  );
  return {
    expiresAt,
    token: scopedAssetToken({
      sourceKind,
      instanceId: grant.instanceId,
      gameId: grant.gameId,
      revision: grant.revision,
      assetPath,
    }, expiresAt, now, secret),
  };
}

/**
 * Creates a child asset capability with the parent token's expiry. This keeps
 * rewritten CSS and module responses byte-stable for one signed cache key.
 */
export function createPreviewAssetTokenForScope(
  scope: PreviewAssetScope,
  expiresAt: number,
  now = Date.now(),
  secret = previewSigningSecret(),
) {
  return scopedAssetToken(scope, expiresAt, now, secret);
}

/**
 * Legacy v1 capabilities are revision-wide and must remain unchanged while
 * rewriting their CSS/module child references. New v2 capabilities keep the
 * path-scoped child-token contract.
 */
export function resolvePreviewChildAssetToken(
  token: string,
  capability: VerifiedPreviewAssetToken,
  childScope: PreviewAssetScope,
  now = Date.now(),
  secret = previewSigningSecret(),
) {
  return capability.version === "v1"
    ? token
    : createPreviewAssetTokenForScope(
        childScope,
        capability.expiresAt,
        now,
        secret,
      );
}

export function verifyPreviewAssetToken(
  token: string,
  scope: PreviewAssetScope,
  now = Date.now(),
  secret = previewSigningSecret(),
): VerifiedPreviewAssetToken | null {
  if (!token) return null;
  if (!token.startsWith(`${PREVIEW_ASSET_TOKEN_VERSION}.`)) {
    if (token.length > MAX_LEGACY_TOKEN_LENGTH) return null;
    const [payload, encodedSignature, extra] = token.split(".");
    if (!payload || !encodedSignature || extra) return null;

    let actualSignature: Buffer;
    let parsed: LegacyPreviewAssetTokenPayload;
    try {
      actualSignature = Buffer.from(encodedSignature, "base64url");
      parsed = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as LegacyPreviewAssetTokenPayload;
    } catch {
      return null;
    }
    const expectedSignature = legacyPreviewAssetSignature(payload, secret);
    if (
      actualSignature.length !== expectedSignature.length
      || !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }
    return parsed.audience === PREVIEW_ASSET_TOKEN_AUDIENCE
      && parsed.version === PREVIEW_ASSET_TOKEN_LEGACY_VERSION
      && parsed.instanceId === scope.instanceId
      && parsed.gameId === scope.gameId
      && parsed.revision === scope.revision
      && Number.isSafeInteger(parsed.expiresAt)
      && parsed.expiresAt > now
      ? { expiresAt: parsed.expiresAt, version: "v1" }
      : null;
  }
  if (token.length > MAX_V2_TOKEN_LENGTH) return null;
  const [version, encodedExpiry, encodedSignature, extra] = token.split(".");
  if (
    version !== PREVIEW_ASSET_TOKEN_VERSION
    || !encodedExpiry
    || !encodedSignature
    || extra
  ) {
    return null;
  }

  const expiresAt = Number.parseInt(encodedExpiry, 36);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;

  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  const expectedSignature = previewAssetSignature(scope, expiresAt, secret);
  if (
    actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }
  return { expiresAt, version: "v2" };
}

function encodedAssetPath(assetPath: string) {
  return assetPath.split("/").map(encodeURIComponent).join("/");
}

export function previewAssetPath(
  scope: PreviewAssetIdentity,
  assetPath: string,
  token: string,
) {
  return `/p/${scope.instanceId}/${scope.gameId}/${scope.revision}/a/${encodeURIComponent(token)}/${encodedAssetPath(assetPath)}`;
}

export function packageAssetPath(
  scope: PreviewAssetIdentity,
  assetPath: string,
  token: string,
) {
  return `/package/${scope.instanceId}/${scope.gameId}/${scope.revision}/a/${encodeURIComponent(token)}/${encodedAssetPath(assetPath)}`;
}

export function previewAssetCacheHeaders(expiresAt: number, now = Date.now()) {
  const maxAge = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const sharedPolicy = `public, max-age=${maxAge}, must-revalidate`;
  return {
    "Cache-Control": `${sharedPolicy}, immutable`,
    "CDN-Cache-Control": sharedPolicy,
    "Vercel-CDN-Cache-Control": sharedPolicy,
  };
}

export function configuredFrameAncestors() {
  const configured = process.env.SDK_PREVIEW_FRAME_ANCESTORS?.trim();
  if (configured) {
    return configured
      .split(/[\s,]+/)
      .filter((value) => /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value));
  }
  const defaults = process.env.VERCEL_GIT_COMMIT_REF === "main"
    ? ["https://sdk.game-fields.com", "https://www.game-fields.com", "https://game-fields.com"]
    : ["https://sdk-dev.game-fields.com", "https://dev.game-fields.com"];
  if (process.env.NODE_ENV !== "production") defaults.push("http://localhost:3001");
  return defaults;
}

function configuredPreviewOrigin(value?: string) {
  if (value && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)) return value;
  if (
    value
    && process.env.NODE_ENV !== "production"
    && /^http:\/\/localhost:\d+$/.test(value)
  ) {
    return value;
  }
  return null;
}

export function previewExchangeContentSecurityPolicy(
  exchangeOrigin?: string,
  scriptHash?: string,
) {
  const ancestors = configuredFrameAncestors();
  const explicitExchangeOrigin = configuredPreviewOrigin(exchangeOrigin);
  const explicitScriptHash = scriptHash
    && /^sha256-[A-Za-z0-9+/=]+$/.test(scriptHash)
    ? `'${scriptHash}'`
    : "'none'";
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `form-action ${explicitExchangeOrigin ?? "'none'"}`,
    "connect-src 'none'",
    `script-src ${explicitScriptHash}`,
    `frame-ancestors ${ancestors.length > 0 ? ancestors.join(" ") : "'none'"}`,
  ].join("; ");
}

const PREVIEW_STYLE_HASH_PATTERN = /^sha256-[A-Za-z0-9+/]{43}=$/;

export class PreviewCspHashGenerationError extends Error {
  readonly code = "CSP_HASH_GENERATION_FAILED";

  constructor() {
    super("CSP_HASH_GENERATION_FAILED");
    this.name = "PreviewCspHashGenerationError";
  }
}

export function previewInlineStyleHash(content: string) {
  try {
    return `sha256-${createHash("sha256").update(content, "utf8").digest("base64")}`;
  } catch {
    throw new PreviewCspHashGenerationError();
  }
}

export function previewInlineStyleHashes(contents: readonly string[]) {
  try {
    return [...new Set(contents.map(previewInlineStyleHash))].sort();
  } catch {
    throw new PreviewCspHashGenerationError();
  }
}

function validatedPreviewStyleHashes(hashes: readonly string[]) {
  if (hashes.some((hash) => !PREVIEW_STYLE_HASH_PATTERN.test(hash))) {
    throw new PreviewCspHashGenerationError();
  }
  return [...new Set(hashes)].sort();
}

export function previewContentSecurityPolicy(
  assetOrigin?: string,
  inlineStyleHashes: readonly string[] = [],
) {
  const ancestors = configuredFrameAncestors();
  const explicitAssetOrigin = configuredPreviewOrigin(assetOrigin);
  const assetSource = explicitAssetOrigin ?? "'none'";
  const styleHashes = validatedPreviewStyleHashes(inlineStyleHashes);
  const styleSources = [
    ...(explicitAssetOrigin ? [explicitAssetOrigin] : []),
    ...styleHashes.map((hash) => `'${hash}'`),
  ];
  const styleSource = styleSources.length > 0
    ? styleSources.join(" ")
    : "'none'";
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `form-action ${assetSource}`,
    "connect-src 'none'",
    `script-src ${assetSource}`,
    `style-src ${styleSource}`,
    `style-src-elem ${styleSource}`,
    "style-src-attr 'none'",
    `img-src ${assetSource} data: blob:`,
    `font-src ${assetSource} data:`,
    `media-src ${assetSource} blob:`,
    "worker-src 'none'",
    "child-src 'none'",
    `frame-ancestors ${ancestors.length > 0 ? ancestors.join(" ") : "'none'"}`,
    "sandbox allow-scripts allow-forms allow-modals allow-pointer-lock",
  ].join("; ");
}
