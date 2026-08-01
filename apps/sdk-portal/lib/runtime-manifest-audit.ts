import {
  RuntimeArtifactError,
  resolveRuntimeExecutionArtifact,
  runtimeManifestSha256,
  type RuntimeArtifactLocator,
  type RuntimeArtifactReader,
} from "@game-fields/sdk-runtime-artifact";
import { sdkSql } from "./sdk-postgres.ts";
import { createGamePackageRuntimeReader } from "./mock-git-store.ts";

const REVISION = /^[a-f0-9]{40}$/;
const GAME = /^[a-z][a-z0-9-]{1,63}$/;

export async function resolveRuntimeArtifactAudit(input: {
  locator: RuntimeArtifactLocator;
  expected: {
    packageRootSha256: string;
    serverBundleSha256: string;
    appSetSourceSha256: string;
    manifest: unknown;
  };
  reader: RuntimeArtifactReader;
}) {
  const artifact = await resolveRuntimeExecutionArtifact({
    locator: input.locator,
    reader: input.reader,
  });
  if (artifact.packageRootSha256 !== input.expected.packageRootSha256) throw new RuntimeArtifactError("PACKAGE_ROOT_HASH_MISMATCH");
  if (artifact.serverBundleSha256 !== input.expected.serverBundleSha256) throw new RuntimeArtifactError("SERVER_BUNDLE_HASH_MISMATCH");
  if (artifact.appSetSourceSha256 !== input.expected.appSetSourceSha256) throw new RuntimeArtifactError("APP_SET_HASH_MISMATCH");
  if (artifact.manifestSha256 !== runtimeManifestSha256(input.expected.manifest)) throw new RuntimeArtifactError("MANIFEST_HASH_MISMATCH");
  return {
    gameId: input.locator.gameId,
    requestedRevision: input.locator.revision,
    resolvedArtifactCommit: artifact.resolvedArtifactCommit,
    packageRootSha256: artifact.packageRootSha256,
    serverBundleSha256: artifact.serverBundleSha256,
    appSetSourceSha256: artifact.appSetSourceSha256,
    manifestSha256: artifact.manifestSha256,
    manifestVersion: artifact.manifestVersion,
  };
}

export async function loadRuntimeManifestAudit(gameId: string, revision: string) {
  if (!GAME.test(gameId) || !REVISION.test(revision)) throw new RuntimeArtifactError("LOCATOR_INVALID");
  const rows = await sdkSql()`
    SELECT public_game_id AS "publicGameId",
           source_creator_slug AS "sourceCreatorSlug",
           source_game_id AS "sourceGameId", revision,
           source_revision AS "sourceRevision",
           package_root_sha256 AS "packageRootSha256",
           server_bundle_sha256 AS "serverBundleSha256",
           app_set_source_sha256 AS "appSetSourceSha256", manifest
    FROM sdk_app_releases
    WHERE public_game_id = ${gameId}
      AND revision = ${revision}
    ORDER BY released_at DESC
    LIMIT 1
  ` as Array<Record<string, unknown>>;
  const row = rows[0];
  if (!row) throw new RuntimeArtifactError("RELEASE_NOT_FOUND");
  return resolveRuntimeArtifactAudit({
    locator: {
      instanceId: String(row.sourceCreatorSlug),
      gameId: String(row.sourceGameId),
      revision: String(row.revision),
    },
    expected: {
      packageRootSha256: String(row.packageRootSha256),
      serverBundleSha256: String(row.serverBundleSha256),
      appSetSourceSha256: String(row.appSetSourceSha256),
      manifest: row.manifest,
    },
    reader: createGamePackageRuntimeReader(),
  }).then((result) => ({ ...result, gameId }));
}
