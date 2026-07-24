import platformRelease from "../../../config/platform-release.json";
import { parseGameFieldsPackageManifest } from "./game-package-manifest";
import {
  prepareGamePackageUploadFiles,
  saveGamePackageFilesToGit,
} from "./mock-git-store";
import { ensureSdkSchema, sdkSql } from "./sdk-postgres";

export type SavedGamePackage = {
  saved: true;
  gameId: string;
  packageRevision: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  status: "submitted";
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

  const revision = await saveGamePackageFilesToGit({
    instanceId: input.creatorSlug,
    gameId: input.gameId,
    files,
  });
  await ensureSdkSchema();
  const manifestJson = JSON.stringify(parsed.manifest.manifest);
  const rows = await sdkSql()`
    UPDATE sdk_games
    SET manifest = ${manifestJson}::jsonb,
        sdk_package_version = ${parsed.manifest.sdkPackageVersion},
        sdk_contract_version = ${parsed.manifest.sdkContractVersion},
        package_revision = ${revision},
        package_bundle_sha256 = ${parsed.bundleSha256},
        package_app_set_sha256 = ${parsed.appSetSourceSha256},
        status = 'submitted',
        updated_at = NOW()
    WHERE creator_id = ${input.creatorId} AND game_id = ${input.gameId}
    RETURNING game_id
  `;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("GAME_SDK_PACKAGE_GAME_NOT_FOUND");
  }

  return {
    saved: true,
    gameId: input.gameId,
    packageRevision: revision,
    serverBundleSha256: parsed.bundleSha256,
    appSetSourceSha256: parsed.appSetSourceSha256,
    status: "submitted",
  };
}
