export type GamePackageRelease = {
  sdkPackageVersion: string;
  supportedSdkContractVersions: readonly number[];
};

export function isGamePackageReleaseSupported(input: {
  sdkPackageVersion: string;
  sdkContractVersion: number;
}, release: GamePackageRelease) {
  return input.sdkPackageVersion === release.sdkPackageVersion
    && release.supportedSdkContractVersions.includes(input.sdkContractVersion);
}
