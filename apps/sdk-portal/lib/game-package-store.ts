import platformRelease from "../../../config/platform-release.json";
import { parseGameFieldsPackageManifest } from "./game-package-manifest";
import {
  prepareGamePackageUploadFiles,
  saveGamePackageFilesToGit,
} from "./mock-git-store";
import { ensureSdkSchema, sdkSql } from "./sdk-postgres";

const MAX_PACKAGE_REVISIONS_PER_GAME = 100;

export type SavedGamePackage = {
  saved: true;
  gameId: string;
  packageRevision: string;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  status: "ready-for-submission";
};

export async function saveCreatorGamePackage(input: {
  creatorId: string;
  creatorSlug: string;
  gameId: string;
  files: unknown;
}): Promise<SavedGamePackage> {
  const files = prepareGamePackageUploadFiles(input.files);
  const parsed = parseGameFieldsPackageManifest({
    gameId: input.gameId,
    files,
  });
  if (
    parsed.manifest.sdkPackageVersion !== platformRelease.sdkPackageVersion
    || parsed.manifest.sdkContractVersion !== platformRelease.sdkContractVersion
  ) {
    throw new Error("GAME_SDK_PACKAGE_RELEASE_MISMATCH");
  }

  await ensureSdkSchema();
  const existingRows = await sdkSql()`
    SELECT r.revision,
           r.package_root_sha256 AS "packageRootSha256",
           r.server_bundle_sha256 AS "serverBundleSha256",
           r.app_set_source_sha256 AS "appSetSourceSha256"
    FROM sdk_game_package_revisions r
    JOIN sdk_games g ON g.id = r.game_id
    WHERE g.creator_id = ${input.creatorId}
      AND g.game_id = ${input.gameId}
      AND r.package_root_sha256 = ${parsed.packageRootSha256}
    LIMIT 1
  `;
  const existing = (Array.isArray(existingRows) ? existingRows[0] : null) as
    | {
        revision: string;
        packageRootSha256: string;
        serverBundleSha256: string;
        appSetSourceSha256: string;
      }
    | null;
  if (existing) {
    return {
      saved: true,
      gameId: input.gameId,
      packageRevision: existing.revision,
      packageRootSha256: existing.packageRootSha256,
      serverBundleSha256: existing.serverBundleSha256,
      appSetSourceSha256: existing.appSetSourceSha256,
      status: "ready-for-submission",
    };
  }

  const revisionCountRows = await sdkSql()`
    SELECT COUNT(r.revision)::int AS count
    FROM sdk_games g
    LEFT JOIN sdk_game_package_revisions r ON r.game_id = g.id
    WHERE g.creator_id = ${input.creatorId}
      AND g.game_id = ${input.gameId}
    GROUP BY g.id
  `;
  if (!Array.isArray(revisionCountRows) || revisionCountRows.length === 0) {
    throw new Error("GAME_SDK_PACKAGE_GAME_NOT_FOUND");
  }
  const revisionCount = Number(
    (revisionCountRows[0] as { count?: unknown } | undefined)?.count,
  );
  if (!Number.isFinite(revisionCount)) {
    throw new Error("GAME_SDK_PACKAGE_REVISION_QUOTA_UNAVAILABLE");
  }
  if (revisionCount >= MAX_PACKAGE_REVISIONS_PER_GAME) {
    throw new Error("GAME_SDK_PACKAGE_REVISION_QUOTA_EXCEEDED");
  }

  const revision = await saveGamePackageFilesToGit({
    instanceId: input.creatorSlug,
    gameId: input.gameId,
    files,
  });
  const manifestJson = JSON.stringify(parsed.manifest.manifest);
  const revisionRows = await sdkSql()`
    INSERT INTO sdk_game_package_revisions (
      game_id, revision, package_root_sha256, server_bundle_sha256,
      app_set_source_sha256, manifest, sdk_package_version,
      sdk_contract_version
    )
    SELECT id, ${revision}, ${parsed.packageRootSha256}, ${parsed.bundleSha256},
           ${parsed.appSetSourceSha256}, ${manifestJson}::jsonb,
           ${parsed.manifest.sdkPackageVersion},
           ${parsed.manifest.sdkContractVersion}
    FROM sdk_games
    WHERE creator_id = ${input.creatorId} AND game_id = ${input.gameId}
    ON CONFLICT (game_id, package_root_sha256) DO NOTHING
    RETURNING revision
  `;
  if (!Array.isArray(revisionRows) || revisionRows.length === 0) {
    throw new Error("GAME_SDK_PACKAGE_REVISION_CONFLICT");
  }
  return {
    saved: true,
    gameId: input.gameId,
    packageRevision: revision,
    packageRootSha256: parsed.packageRootSha256,
    serverBundleSha256: parsed.bundleSha256,
    appSetSourceSha256: parsed.appSetSourceSha256,
    status: "ready-for-submission",
  };
}
