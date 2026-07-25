import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExpectedGamePackageSource,
  gamePackagePromotionSource,
  GamePackagePromotionError,
} from "../apps/sdk-portal/lib/game-package-promotion.ts";

const candidate = {
  manifest: { id: "fixture" },
  packageRevision: "a".repeat(40),
  packageRootSha256: "1".repeat(64),
  packageBundleSha256: "b".repeat(64),
  packageAppSetSha256: "c".repeat(64),
  developmentRevision: "d".repeat(40),
  developmentRootSha256: "2".repeat(64),
  developmentBundleSha256: "e".repeat(64),
  developmentAppSetSha256: "f".repeat(64),
  developmentManifest: { id: "fixture", channel: "development" },
};

test("development promotion copies candidate revision and hashes unchanged", () => {
  assert.deepEqual(gamePackagePromotionSource(candidate, "development"), {
    revision: candidate.packageRevision,
    packageRootSha256: candidate.packageRootSha256,
    bundleSha256: candidate.packageBundleSha256,
    appSetSha256: candidate.packageAppSetSha256,
    manifest: candidate.manifest,
  });
});

test("stable promotion copies development revision and hashes unchanged", () => {
  assert.deepEqual(gamePackagePromotionSource(candidate, "stable"), {
    revision: candidate.developmentRevision,
    packageRootSha256: candidate.developmentRootSha256,
    bundleSha256: candidate.developmentBundleSha256,
    appSetSha256: candidate.developmentAppSetSha256,
    manifest: candidate.developmentManifest,
  });
  assert.equal(gamePackagePromotionSource({
    ...candidate,
    developmentAppSetSha256: null,
  }, "stable"), null);
});

test("creator promotion requires the exact submitted revision and all hashes", () => {
  const source = gamePackagePromotionSource(candidate, "development");
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
