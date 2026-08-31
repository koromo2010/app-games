export const developmentPrivateWorkspaceImportEnvironment = "development" as const;
export const developmentPrivateWorkspaceImportIntent =
  "development-private-workspace-import-v1" as const;
export const developmentPrivateWorkspaceImportSchemaVersion = 1 as const;

export type DevelopmentPrivateWorkspaceImportTarget = "moi-lab2" | "yabobojpn-lab";

export type DevelopmentPrivateWorkspaceImportTargetSpec = {
  target: DevelopmentPrivateWorkspaceImportTarget;
  bundleBytes: number;
  bundleSha256: string;
  gameCount: number;
  gameIdentitySetSha256: string;
  perGameIdentitySha256: string;
};

export const developmentPrivateWorkspaceImportTargetSpecs = Object.freeze({
  "moi-lab2": Object.freeze({
    target: "moi-lab2",
    bundleBytes: 127_345,
    bundleSha256: "71834a0633bb35cb3021c01a758db9f9005f148b790bab9c8b89fd3adb346305",
    gameCount: 2,
    gameIdentitySetSha256: "02391d46bc5f142458873e0e7263be48f23bb72f426635663032a438d6dc79fc",
    perGameIdentitySha256: "f93f01e078cb10a08bf5822e185f1cad0b8ab2734c5d695327d7f2b0c0799220",
  }),
  "yabobojpn-lab": Object.freeze({
    target: "yabobojpn-lab",
    bundleBytes: 794_921,
    bundleSha256: "fb743dca6eec13359b8f3f397d3a6c9a73445d7dfb5c72a28ea832cb9e56e522",
    gameCount: 5,
    gameIdentitySetSha256: "979f902cdd8ff70a1946d4f989088fbdfd0dbcdf53a37a0344bbdb0e163682ce",
    perGameIdentitySha256: "e9111e91c17aa9d467b6a6ef13f1b6e82b5d6bc638b3874ed255af27195fa7a4",
  }),
} satisfies Record<DevelopmentPrivateWorkspaceImportTarget, DevelopmentPrivateWorkspaceImportTargetSpec>);

export function isDevelopmentPrivateWorkspaceImportTarget(
  value: unknown,
): value is DevelopmentPrivateWorkspaceImportTarget {
  return value === "moi-lab2" || value === "yabobojpn-lab";
}
