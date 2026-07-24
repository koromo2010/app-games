import { createSdkPreviewToken } from "@game-fields/sdk-preview-auth";

const PREVIEW_TOKEN_LIFETIME_MS = 10 * 60 * 1000;
const PACKAGE_CLIENT_TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000;
const PACKAGE_SERVER_TOKEN_LIFETIME_MS = 10 * 60 * 1000;

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
    version: 2 as const,
    audience: "mock-client" as const,
    instanceId: input.instanceId,
    gameId: input.gameId,
    revision: input.revision,
    expiresAt: now + PREVIEW_TOKEN_LIFETIME_MS,
  };
  const token = createSdkPreviewToken(grant, previewSigningSecret());
  const route = `/open/${grant.instanceId}/${grant.gameId}/${grant.revision}`;
  return `${previewRuntimeBaseUrl()}${route}?token=${encodeURIComponent(token)}`;
}

export function createPackageRuntimeAccess(input: {
  instanceId: string;
  gameId: string;
  revision: string;
  serverBundleSha256: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const clientGrant = {
    version: 2 as const,
    audience: "package-client" as const,
    instanceId: input.instanceId,
    gameId: input.gameId,
    revision: input.revision,
    expiresAt: now + PACKAGE_CLIENT_TOKEN_LIFETIME_MS,
  };
  const serverGrant = {
    version: 2 as const,
    audience: "package-server" as const,
    instanceId: input.instanceId,
    gameId: input.gameId,
    revision: input.revision,
    bundleSha256: input.serverBundleSha256,
    expiresAt: now + PACKAGE_SERVER_TOKEN_LIFETIME_MS,
  };
  const clientToken = createSdkPreviewToken(clientGrant, previewSigningSecret());
  const serverToken = createSdkPreviewToken(serverGrant, previewSigningSecret());
  const baseUrl = previewRuntimeBaseUrl();
  return {
    clientRuntimeUrl: `${baseUrl}/package-open/${clientGrant.instanceId}/${clientGrant.gameId}/${clientGrant.revision}?token=${encodeURIComponent(clientToken)}`,
    serverRuntimeUrl: `${baseUrl}/server/${serverGrant.instanceId}/${serverGrant.gameId}/${serverGrant.revision}`,
    serverRuntimeToken: serverToken,
    expiresAt: serverGrant.expiresAt,
  };
}
