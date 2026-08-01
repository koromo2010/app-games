export type GamePackagePromotionTarget = {
  manifest: unknown;
  packageRevision: string | null;
  packageRootSha256: string | null;
  packageBundleSha256: string | null;
  packageAppSetSha256: string | null;
};

export type GamePackagePromotionSource = {
  revision: string;
  packageRootSha256: string;
  bundleSha256: string;
  appSetSha256: string;
  manifest: object;
};

export type GamePackagePromotionReleaseRevisions = {
  revision: string;
  sourceRevision: string;
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
): GamePackagePromotionSource | null {
  const source = {
    revision: target.packageRevision,
    packageRootSha256: target.packageRootSha256,
    bundleSha256: target.packageBundleSha256,
    appSetSha256: target.packageAppSetSha256,
    manifest: target.manifest,
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

export function gamePackagePromotionReleaseRevisions(
  source: GamePackagePromotionSource,
): GamePackagePromotionReleaseRevisions {
  return {
    revision: source.revision,
    sourceRevision: source.revision,
  };
}

export function promotionErrorResponse(error: unknown) {
  if (error instanceof GamePackagePromotionError) {
    return Response.json({ error: error.code }, { status: error.status });
  }
  const sqlState = typeof (error as { code?: unknown } | null)?.code === "string"
    ? (error as { code: string }).code
    : "";
  const message = error instanceof Error ? error.message : "";
  if (sqlState === "23505" || /unique/i.test(message)) {
    return Response.json({ error: "public_game_id_conflict" }, { status: 409 });
  }
  return Response.json({ error: "promotion_failed" }, { status: 503 });
}
