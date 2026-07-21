import { createSdkPreviewToken } from "@game-fields/sdk-preview-auth";

const TOKEN_LIFETIME_MS = 10 * 60 * 1000;

function previewSigningSecret() {
  const secret = process.env.SDK_PREVIEW_SIGNING_SECRET ?? "";
  if (!secret) throw new Error("SDK preview signing is not configured.");
  return secret;
}

export function previewRuntimeBaseUrl() {
  return process.env.SDK_PREVIEW_BASE_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main"
      ? "https://preview.game-fields.com"
      : "https://preview-dev.game-fields.com");
}

export function createPreviewRuntimeUrl(input: {
  instanceId: string;
  gameId: string;
  revision: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const grant = {
    version: 1 as const,
    instanceId: input.instanceId,
    gameId: input.gameId,
    revision: input.revision,
    expiresAt: now + TOKEN_LIFETIME_MS,
  };
  const token = createSdkPreviewToken(grant, previewSigningSecret());
  const route = `/open/${grant.instanceId}/${grant.gameId}/${grant.revision}`;
  return `${previewRuntimeBaseUrl()}${route}?token=${encodeURIComponent(token)}`;
}
