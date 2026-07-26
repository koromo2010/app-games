import { createSdkPreviewToken } from "@game-fields/sdk-preview-auth";

const PREVIEW_TOKEN_LIFETIME_MS = 10 * 60 * 1000;
const PACKAGE_CLIENT_TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000;
const PACKAGE_SERVER_TOKEN_LIFETIME_MS = 10 * 60 * 1000;

type PreviewEnvironment = "production" | "development";
type RuntimeChannel = "candidate-preview" | "development" | "main";

function previewSigningSecret() {
  const secret = process.env.SDK_PREVIEW_SIGNING_SECRET?.trim() ?? "";
  if (!secret) throw new Error("SDK preview signing is not configured.");
  return secret;
}

function previewEnvironment(): PreviewEnvironment {
  return process.env.VERCEL_GIT_COMMIT_REF === "main"
    ? "production"
    : "development";
}

function environmentForChannel(channel: RuntimeChannel): PreviewEnvironment {
  if (channel === "development") return "development";
  if (channel === "main") return "production";
  return previewEnvironment();
}

export function previewRuntimeBaseUrl(environment: PreviewEnvironment = previewEnvironment()) {
  const configured = environment === previewEnvironment()
    ? process.env.SDK_PREVIEW_BASE_URL?.replace(/\/$/, "")
    : undefined;
  return configured
    ?? (environment === "production"
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
  const environment = previewEnvironment();
  const grant = {
    version: 3 as const,
    audience: "mock-client" as const,
    environment,
    channel: "candidate-preview" as const,
    role: "client" as const,
    instanceId: input.instanceId,
    gameId: input.gameId,
    revision: input.revision,
    expiresAt: now + PREVIEW_TOKEN_LIFETIME_MS,
  };
  const token = createSdkPreviewToken(grant, previewSigningSecret());
  const route = `/open/${grant.instanceId}/${grant.gameId}/${grant.revision}`;
  return `${previewRuntimeBaseUrl(environment)}${route}?token=${encodeURIComponent(token)}`;
}

export function createPackageRuntimeAccess(input: {
  instanceId: string;
  gameId: string;
  revision: string;
  serverBundleSha256: string;
  channel?: RuntimeChannel;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const channel = input.channel ?? "candidate-preview";
  const environment = environmentForChannel(channel);
  const clientGrant = {
    version: 3 as const,
    audience: "package-client" as const,
    environment,
    channel,
    role: "client" as const,
    instanceId: input.instanceId,
    gameId: input.gameId,
    revision: input.revision,
    expiresAt: now + PACKAGE_CLIENT_TOKEN_LIFETIME_MS,
  };
  const serverGrant = {
    version: 3 as const,
    audience: "package-server" as const,
    environment,
    channel,
    role: "runner" as const,
    instanceId: input.instanceId,
    gameId: input.gameId,
    revision: input.revision,
    bundleSha256: input.serverBundleSha256,
    expiresAt: now + PACKAGE_SERVER_TOKEN_LIFETIME_MS,
  };
  const clientToken = createSdkPreviewToken(clientGrant, previewSigningSecret());
  const serverToken = createSdkPreviewToken(serverGrant, previewSigningSecret());
  const baseUrl = previewRuntimeBaseUrl(environment);
  return {
    clientRuntimeUrl: `${baseUrl}/package-open/${clientGrant.instanceId}/${clientGrant.gameId}/${clientGrant.revision}?token=${encodeURIComponent(clientToken)}`,
    serverRuntimeUrl: `${baseUrl}/server/${serverGrant.instanceId}/${serverGrant.gameId}/${serverGrant.revision}`,
    serverRuntimeToken: serverToken,
    expiresAt: serverGrant.expiresAt,
  };
}
