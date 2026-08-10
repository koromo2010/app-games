export type SdkReleaseEnvironment = "production" | "development";

export type PlatformRelease = {
  platformVersion: string;
  sdkPackageVersion: string;
  sdkHandshakeVersion: number;
  sdkContractVersion: number;
  roomSchemaVersion: number;
  supportedSdkContractVersions: number[];
};

export type SdkReleaseProfile = {
  environment: SdkReleaseEnvironment;
  channel: "stable" | "developer-preview";
  portalBaseUrl: string;
  pluginName: string;
  connectorDisplayName: "Game Fields" | "Game Fields Development — TEST ONLY";
  toolDescriptionPrefix: "[PRODUCTION]" | "[DEVELOPMENT / TEST ONLY]";
  onboardingProfileId: string;
  downloadMeBaseName: "GameFieldsDownloadMe" | "GameFieldsDownloadMe-dev";
  claudeCodeProfileBaseName: "GameFieldsClaudeCode" | "GameFieldsClaudeCode-dev";
  starterRef: "sdk-starter" | "sdk-starter-dev";
};

export type SdkReleaseProfileInput = {
  environment: string;
  channel: string;
  portalBaseUrl: string;
  pluginName: string;
  connectorDisplayName: string;
  toolDescriptionPrefix: string;
  onboardingProfileId: string;
  downloadMeBaseName: string;
  claudeCodeProfileBaseName: string;
  starterRef: string;
};

export type SdkReleaseProfileConfigurationInput = {
  schemaVersion: number;
  profiles: Record<string, SdkReleaseProfileInput>;
};

export type SdkReleaseProfileConfiguration = SdkReleaseProfileConfigurationInput & {
  schemaVersion: 1;
  profiles: Record<SdkReleaseEnvironment, SdkReleaseProfile>;
};

export function validateSdkReleaseProfiles(
  profileConfig: SdkReleaseProfileConfigurationInput,
): SdkReleaseProfileConfiguration;

export function validateSdkReleaseConfiguration(
  release: PlatformRelease,
  profileConfig: SdkReleaseProfileConfigurationInput,
): { release: PlatformRelease; profileConfig: SdkReleaseProfileConfiguration };

export function resolveSdkReleaseEnvironment(input: {
  requestedEnvironment?: string;
  gitRef?: string;
  portalBaseUrl?: string;
  defaultEnvironment?: string;
  profileConfig: SdkReleaseProfileConfigurationInput;
}): SdkReleaseEnvironment;

export function resolveSdkReleaseProfile(input: {
  release: PlatformRelease;
  profileConfig: SdkReleaseProfileConfigurationInput;
  requestedEnvironment?: string;
  gitRef?: string;
  portalBaseUrl?: string;
  defaultEnvironment?: string;
}): SdkReleaseProfile;

export function sdkDownloadMeVersion(release: PlatformRelease): string;
export function sdkDownloadMeFileName(
  release: PlatformRelease,
  profile: SdkReleaseProfile,
): string;
export function sdkClaudeCodeProfileFileName(
  release: PlatformRelease,
  profile: SdkReleaseProfile,
): string;
export function sdkCanonicalMcpUrl(profile: SdkReleaseProfile): string;
export function renderSdkOnboardingTemplate(
  template: string,
  release: PlatformRelease,
  profile: SdkReleaseProfile,
): string;
export function renderSdkDownloadMe(
  template: string,
  release: PlatformRelease,
  profile: SdkReleaseProfile,
): string;
