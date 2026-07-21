import { createHash } from "node:crypto";
import type { SdkPreviewGrant } from "@game-fields/sdk-preview-auth";

export function previewSigningSecret() {
  const secret = process.env.SDK_PREVIEW_SIGNING_SECRET ?? "";
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

function configuredFrameAncestors() {
  const configured = process.env.SDK_PREVIEW_FRAME_ANCESTORS?.trim();
  if (configured) {
    return configured
      .split(/[\s,]+/)
      .filter((value) => /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value));
  }
  const defaults = [process.env.VERCEL_GIT_COMMIT_REF === "main"
    ? "https://sdk.game-fields.com"
    : "https://sdk-dev.game-fields.com"];
  if (process.env.NODE_ENV !== "production") defaults.push("http://localhost:3001");
  return defaults;
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
    "base-uri 'none'",
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
