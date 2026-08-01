import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExpectedGamePackageSource,
  gamePackagePromotionReleaseRevisions,
  gamePackagePromotionSource,
  GamePackagePromotionError,
} from "../apps/sdk-portal/lib/game-package-promotion.ts";

const candidate = {
  manifest: { id: "fixture" },
  packageRevision: "a".repeat(40),
  packageRootSha256: "1".repeat(64),
  packageBundleSha256: "b".repeat(64),
  packageAppSetSha256: "c".repeat(64),
};

test("main adoption copies candidate revision and hashes unchanged", () => {
  const source = gamePackagePromotionSource(candidate);
  assert.deepEqual(source, {
    revision: candidate.packageRevision,
    packageRootSha256: candidate.packageRootSha256,
    bundleSha256: candidate.packageBundleSha256,
    appSetSha256: candidate.packageAppSetSha256,
    manifest: candidate.manifest,
  });
  assert.ok(source);
  assert.deepEqual(gamePackagePromotionReleaseRevisions(source), {
    revision: candidate.packageRevision,
    sourceRevision: candidate.packageRevision,
  });
});

test("main adoption rejects an incomplete candidate source", () => {
  assert.equal(gamePackagePromotionSource({
    ...candidate,
    packageAppSetSha256: null,
  }), null);
});

test("admin adoption requires the exact submitted revision and all hashes", () => {
  const source = gamePackagePromotionSource(candidate);
  assert.ok(source);
  const expected = {
    revision: source.revision,
    packageRootSha256: source.packageRootSha256,
    serverBundleSha256: source.bundleSha256,
    appSetSourceSha256: source.appSetSha256,
  };
  assert.doesNotThrow(() =>
    assertExpectedGamePackageSource(source, expected)
  );
  assert.throws(
    () => assertExpectedGamePackageSource(source, {
      ...expected,
      appSetSourceSha256: "0".repeat(64),
    }),
    (error) =>
      error instanceof GamePackagePromotionError
      && error.code === "promotion_expected_source_changed"
      && error.status === 409,
  );
});
