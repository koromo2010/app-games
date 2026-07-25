export type GamePackagePromotionTarget = {
  manifest: unknown;
  packageRevision: string | null;
  packageRootSha256: string | null;
  packageBundleSha256: string | null;
  packageAppSetSha256: string | null;
  developmentRevision: string | null;
  developmentRootSha256: string | null;
  developmentBundleSha256: string | null;
  developmentAppSetSha256: string | null;
  developmentManifest: unknown;
};

export type GamePackagePromotionSource = {
  revision: string;
  packageRootSha256: string;
  bundleSha256: string;
  appSetSha256: string;
  manifest: object;
};

export type ExpectedGamePackageSource = {
  revision: string;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
};

export class GamePackagePromotionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function assertExpectedGamePackageSource(
  source: {
    revision: string;
    packageRootSha256: string;
    bundleSha256: string;
    appSetSha256: string;
  },
  expected: ExpectedGamePackageSource | undefined,
) {
  if (!expected) return;
  if (
    source.revision !== expected.revision
    || source.packageRootSha256 !== expected.packageRootSha256
    || source.bundleSha256 !== expected.serverBundleSha256
    || source.appSetSha256 !== expected.appSetSourceSha256
  ) {
    throw new GamePackagePromotionError("promotion_expected_source_changed", 409);
  }
}

export function gamePackagePromotionSource(
  target: GamePackagePromotionTarget,
  channel: "development" | "stable",
): GamePackagePromotionSource | null {
  const source = channel === "development"
    ? {
        revision: target.packageRevision,
        packageRootSha256: target.packageRootSha256,
        bundleSha256: target.packageBundleSha256,
        appSetSha256: target.packageAppSetSha256,
        manifest: target.manifest,
      }
    : {
        revision: target.developmentRevision,
        packageRootSha256: target.developmentRootSha256,
        bundleSha256: target.developmentBundleSha256,
        appSetSha256: target.developmentAppSetSha256,
        manifest: target.developmentManifest,
      };
  const { revision, packageRootSha256, bundleSha256, appSetSha256, manifest } = source;
  if (
    !revision
    || !packageRootSha256
    || !bundleSha256
    || !appSetSha256
    || !manifest
    || typeof manifest !== "object"
  ) return null;
  return { revision, packageRootSha256, bundleSha256, appSetSha256, manifest };
}
