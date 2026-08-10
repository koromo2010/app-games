import authoringContract from "../../../config/sdk-authoring-contract.json" with { type: "json" };
import platformRelease from "../../../config/platform-release.json" with { type: "json" };
import { sdkCanonicalMcpUrl } from "@game-fields/sdk-release-profiles";
import { sdkPortalReleaseProfile } from "./sdk-release-profile.ts";

export type SdkAuthoringClientId = "chatgpt-work" | "claude-code";

export const SDK_AUTHORING_CONTRACT = authoringContract;

export function sdkAuthoringClientProfile(clientId: SdkAuthoringClientId) {
  const profile = authoringContract.supportedClients.find(
    (candidate) => candidate.id === clientId,
  );
  if (!profile) throw new Error("SDK_AUTHORING_CLIENT_UNSUPPORTED");
  return profile;
}

export function createSdkAuthoringProfile(
  clientId: SdkAuthoringClientId,
  origin?: string,
) {
  const releaseProfile = sdkPortalReleaseProfile(origin);
  return {
    contract: authoringContract,
    client: sdkAuthoringClientProfile(clientId),
    identity: {
      targetEnvironment: releaseProfile.environment,
      canonicalMcpUrl: sdkCanonicalMcpUrl(releaseProfile),
      release: {
        platformVersion: platformRelease.platformVersion,
        sdkPackageVersion: platformRelease.sdkPackageVersion,
        sdkContractVersion: platformRelease.sdkContractVersion,
      },
      onboardingProfileId: releaseProfile.onboardingProfileId,
      connectorDisplayName: releaseProfile.connectorDisplayName,
    },
  };
}
