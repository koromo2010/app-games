import assert from "node:assert/strict";
import test from "node:test";
import {
  gamePackagePromotionSource,
} from "../apps/sdk-portal/lib/game-package-promotion.ts";

const candidate = {
  manifest: { id: "fixture" },
  packageRevision: "a".repeat(40),
  packageBundleSha256: "b".repeat(64),
  packageAppSetSha256: "c".repeat(64),
  developmentRevision: "d".repeat(40),
  developmentBundleSha256: "e".repeat(64),
  developmentAppSetSha256: "f".repeat(64),
  developmentManifest: { id: "fixture", channel: "development" },
};

test("development promotion copies candidate revision and hashes unchanged", () => {
  assert.deepEqual(gamePackagePromotionSource(candidate, "development"), {
    revision: candidate.packageRevision,
    bundleSha256: candidate.packageBundleSha256,
    appSetSha256: candidate.packageAppSetSha256,
    manifest: candidate.manifest,
  });
});

test("stable promotion copies development revision and hashes unchanged", () => {
  assert.deepEqual(gamePackagePromotionSource(candidate, "stable"), {
    revision: candidate.developmentRevision,
    bundleSha256: candidate.developmentBundleSha256,
    appSetSha256: candidate.developmentAppSetSha256,
    manifest: candidate.developmentManifest,
  });
  assert.equal(gamePackagePromotionSource({
    ...candidate,
    developmentAppSetSha256: null,
  }, "stable"), null);
});
