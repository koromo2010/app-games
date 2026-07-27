import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SdkPreviewGrant } from "@game-fields/sdk-preview-auth";

const PREVIEW_ASSET_TOKEN_AUDIENCE = "game-fields-preview-assets";
const PREVIEW_ASSET_TOKEN_VERSION = 1;
const PREVIEW_CLIENT_SESSION_AUDIENCE = "game-fields-preview-client-session";
const PREVIEW_CLIENT_SESSION_VERSION = 1;
const PREVIEW_CLIENT_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const MAX_LOCAL_TOKEN_LENGTH = 2_048;

type PreviewAssetScope = Pick<SdkPreviewGrant, "instanceId" | "gameId" | "revision">;
type PreviewAssetTokenPayload = PreviewAssetScope & {
  audience: typeof PREVIEW_ASSET_TOKEN_AUDIENCE;
  expiresAt: number;
  version: typeof PREVIEW_ASSET_TOKEN_VERSION;
};
export type PreviewClientSession = PreviewAssetScope & Pick<
  SdkPreviewGrant,
  "channel" | "environment"
> & {
  audience: "mock-client" | "package-client";
  expiresAt: number;
  tokenAudience: typeof PREVIEW_CLIENT_SESSION_AUDIENCE;
  version: typeof PREVIEW_CLIENT_SESSION_VERSION;
};

export function previewSigningSecret() {
  const secret = process.env.SDK_PREVIEW_SIGNING_SECRET?.trim() ?? "";
  if (!secret) throw new Error("SDK preview signing is not configured.");
  return secret;
}

export function previewCookieName(grant: Pick<SdkPreviewGrant, "instanceId" | "gameId" | "revision">) {
  const scope = `${grant.instanceId}/${grant.gameId}/${grant.revision}`;
  return `game_fields_preview_${createHash("sha256").update(scope).digest("hex").slice(0, 20)}`;
}

export function previewCookiePath(grant: Pick<SdkPreviewGrant, "instanceId" | "gameId" | "revision">) {
  return `/p/${grant.instanceId}/${grant.gameId}/${grant.revision}/`;
}

export function packageCookieName(grant: Pick<SdkPreviewGrant, "instanceId" | "gameId" | "revision">) {
  return `${previewCookieName(grant)}_package`;
}

export function packageCookiePath(grant: Pick<SdkPreviewGrant, "instanceId" | "gameId" | "revision">) {
  return `/package/${grant.instanceId}/${grant.gameId}/${grant.revision}/`;
}

function previewAssetSignature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${PREVIEW_ASSET_TOKEN_AUDIENCE}:${payload}`)
    .digest();
}

function previewClientSessionSignature(payload: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${PREVIEW_CLIENT_SESSION_AUDIENCE}:${payload}`)
    .digest();
}

export function createPreviewClientSessionToken(
  grant: SdkPreviewGrant,
  now = Date.now(),
  secret = previewSigningSecret(),
) {
  if (
    grant.role !== "client"
    || (grant.audience !== "mock-client" && grant.audience !== "package-client")
    || grant.expiresAt <= now
  ) {
    throw new Error("SDK preview client grant is invalid.");
  }
  const session = {
    audience: grant.audience,
    tokenAudience: PREVIEW_CLIENT_SESSION_AUDIENCE,
    version: PREVIEW_CLIENT_SESSION_VERSION,
    environment: grant.environment,
    channel: grant.channel,
    instanceId: grant.instanceId,
    gameId: grant.gameId,
    revision: grant.revision,
    expiresAt: now + PREVIEW_CLIENT_SESSION_LIFETIME_MS,
  } satisfies PreviewClientSession;
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return {
    expiresAt: session.expiresAt,
    token: `${payload}.${previewClientSessionSignature(payload, secret).toString("base64url")}`,
  };
}

export function verifyPreviewClientSessionToken(
  token: string,
  now = Date.now(),
  secret = previewSigningSecret(),
): PreviewClientSession | null {
  if (!token || token.length > MAX_LOCAL_TOKEN_LENGTH) return null;
  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra) return null;

  let suppliedSignature: Buffer;
  let parsed: PreviewClientSession;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
    parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as PreviewClientSession;
  } catch {
    return null;
  }
  const expectedSignature = previewClientSessionSignature(payload, secret);
  if (
    suppliedSignature.length !== expectedSignature.length
    || !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return null;
  }
  return parsed.tokenAudience === PREVIEW_CLIENT_SESSION_AUDIENCE
    && parsed.version === PREVIEW_CLIENT_SESSION_VERSION
    && (parsed.audience === "mock-client" || parsed.audience === "package-client")
    && (parsed.environment === "production" || parsed.environment === "development")
    && (
      parsed.channel === "candidate-preview"
      || parsed.channel === "development"
      || parsed.channel === "main"
    )
    && (
      parsed.channel === "candidate-preview"
      || (
        parsed.channel === "development"
        && parsed.environment === "development"
      )
      || (
        parsed.channel === "main"
        && parsed.environment === "production"
      )
    )
    && typeof parsed.instanceId === "string"
    && typeof parsed.gameId === "string"
    && typeof parsed.revision === "string"
    && Number.isSafeInteger(parsed.expiresAt)
    && parsed.expiresAt > now
    ? parsed
    : null;
}

/**
 * Sandboxed mocks intentionally have an opaque origin, so their subresource
 * requests cannot rely on the scoped HttpOnly preview cookie. This token grants
 * read-only access to assets from exactly one already-authorized revision.
 */
export function createPreviewAssetToken(
  grant: PreviewAssetScope & Pick<SdkPreviewGrant, "expiresAt">,
  secret = previewSigningSecret(),
) {
  const payload = Buffer.from(JSON.stringify({
    audience: PREVIEW_ASSET_TOKEN_AUDIENCE,
    version: PREVIEW_ASSET_TOKEN_VERSION,
    instanceId: grant.instanceId,
    gameId: grant.gameId,
    revision: grant.revision,
    expiresAt: grant.expiresAt,
  } satisfies PreviewAssetTokenPayload)).toString("base64url");
  return `${payload}.${previewAssetSignature(payload, secret).toString("base64url")}`;
}

export function verifyPreviewAssetToken(
  token: string,
  scope: PreviewAssetScope,
  now = Date.now(),
  secret = previewSigningSecret(),
) {
  if (!token || token.length > 2_048) return false;
  const [payload, encodedSignature, extra] = token.split(".");
  if (!payload || !encodedSignature || extra) return false;

  let actualSignature: Buffer;
  let parsed: PreviewAssetTokenPayload;
  try {
    actualSignature = Buffer.from(encodedSignature, "base64url");
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PreviewAssetTokenPayload;
  } catch {
    return false;
  }

  const expectedSignature = previewAssetSignature(payload, secret);
  if (
    actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return false;
  }

  return parsed.audience === PREVIEW_ASSET_TOKEN_AUDIENCE
    && parsed.version === PREVIEW_ASSET_TOKEN_VERSION
    && parsed.instanceId === scope.instanceId
    && parsed.gameId === scope.gameId
    && parsed.revision === scope.revision
    && Number.isSafeInteger(parsed.expiresAt)
    && parsed.expiresAt > now;
}

export function previewAssetBasePath(scope: PreviewAssetScope, token: string) {
  return `${previewCookiePath(scope)}a/${encodeURIComponent(token)}/`;
}

export function packageAssetBasePath(scope: PreviewAssetScope, token: string) {
  return `${packageCookiePath(scope)}a/${encodeURIComponent(token)}/`;
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

export function previewExchangeContentSecurityPolicy() {
  const ancestors = configuredFrameAncestors();
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'none'",
    "connect-src 'self'",
    "script-src 'unsafe-inline'",
    `frame-ancestors ${ancestors.length > 0 ? ancestors.join(" ") : "'none'"}`,
  ].join("; ");
}

export function previewContentSecurityPolicy(assetOrigin?: string) {
  const ancestors = configuredFrameAncestors();
  const explicitAssetOrigin = assetOrigin && /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(assetOrigin)
    ? assetOrigin
    : assetOrigin && process.env.NODE_ENV !== "production" && /^http:\/\/localhost:\d+$/.test(assetOrigin)
      ? assetOrigin
      : null;
  const assetSources = ["'self'", explicitAssetOrigin].filter(Boolean).join(" ");
  return [
    "default-src 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'none'",
    "connect-src 'none'",
    `script-src ${assetSources} 'unsafe-inline'`,
    `style-src ${assetSources} 'unsafe-inline'`,
    `img-src ${assetSources} data: blob:`,
    `font-src ${assetSources} data:`,
    `media-src ${assetSources} blob:`,
    "worker-src 'none'",
    "child-src 'none'",
    `frame-ancestors ${ancestors.length > 0 ? ancestors.join(" ") : "'none'"}`,
    "sandbox allow-scripts allow-modals allow-pointer-lock",
  ].join("; ");
}
