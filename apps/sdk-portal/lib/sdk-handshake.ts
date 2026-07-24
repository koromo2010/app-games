import {
  GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
  GAME_FIELDS_SDK_HANDSHAKE_VERSION,
  negotiateGameSdkHandshake,
  type GameSdkHandshakeDescriptor,
  type GameSdkHandshakeRequest,
} from "@game-fields/game-sdk/handshake";
import platformRelease from "../../../config/platform-release.json";
import { portalBaseUrl } from "@/lib/oauth-store";

export const SDK_PORTAL_CAPABILITIES = [
  "oauth2-pkce",
  "creator-environments",
  "starter-download",
  "mock-publish",
  "game-package-publish",
  "formal-room-preview",
  "hash-pinned-promotion",
] as const;

export function sdkPortalEnvironment(base: string) {
  const requested = process.env.SDK_PORTAL_CHANNEL?.trim().toLowerCase();
  if (requested === "production" || requested === "development") return requested;
  const hostname = new URL(base).hostname;
  if (hostname === "sdk.game-fields.com") return "production";
  if (hostname === "sdk-dev.game-fields.com") return "development";
  return process.env.VERCEL_GIT_COMMIT_REF === "main" ? "production" : "development";
}

export function createSdkPortalHandshakeDescriptor(origin?: string): GameSdkHandshakeDescriptor {
  const base = portalBaseUrl(origin);
  return {
    protocol: GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
    handshakeVersion: GAME_FIELDS_SDK_HANDSHAKE_VERSION,
    surface: "creator-portal",
    environment: sdkPortalEnvironment(base),
    release: {
      platformVersion: platformRelease.platformVersion,
      sdkPackageVersion: platformRelease.sdkPackageVersion,
      sdkContractVersion: platformRelease.sdkContractVersion,
      supportedSdkContractVersions: platformRelease.supportedSdkContractVersions,
      roomSchemaVersion: platformRelease.roomSchemaVersion,
    },
    capabilities: SDK_PORTAL_CAPABILITIES,
    endpoints: {
      portal: base,
      handshake: `${base}/.well-known/game-fields-sdk`,
      mcp: `${base}/api/mcp`,
    },
  };
}

export function negotiateSdkPortalHandshake(
  request: GameSdkHandshakeRequest | unknown,
  origin?: string,
) {
  return negotiateGameSdkHandshake(request, createSdkPortalHandshakeDescriptor(origin));
}
