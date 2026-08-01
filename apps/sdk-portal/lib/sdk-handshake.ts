import {
  GAME_FIELDS_SDK_HANDSHAKE_PROTOCOL,
  GAME_FIELDS_SDK_HANDSHAKE_VERSION,
  negotiateGameSdkHandshake,
  type GameSdkHandshakeDescriptor,
  type GameSdkHandshakeRequest,
} from "@game-fields/game-sdk/handshake";
import platformRelease from "../../../config/platform-release.json";
import { portalBaseUrl } from "@/lib/oauth-store";
import { sdkPortalReleaseProfile } from "@/lib/sdk-release-profile";

export const SDK_PORTAL_CAPABILITIES = [
  "oauth2-pkce",
  "creator-environments",
  "starter-download",
  "mock-publish",
  "game-package-publish",
  "formal-room-preview",
  "hash-pinned-promotion",
  "support-threads",
  "human-approved-reporting",
  "human-approved-support-replies",
] as const;

export function sdkPortalEnvironment(base: string) {
  return sdkPortalReleaseProfile(base).environment;
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
