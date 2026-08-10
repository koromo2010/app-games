import platformRelease from "../../../config/platform-release.json" with { type: "json" };
import { parseGameFieldsPackageManifest } from "./game-package-manifest.ts";
import {
  saveValidatedGamePackage,
  type ValidatedGamePackage,
} from "./game-package-persistence.ts";
import {
  prepareGamePackageUploadFiles,
  saveGamePackageFilesToGit,
} from "./mock-git-store.ts";
import { ensureSdkSchema, sdkSql } from "./sdk-postgres.ts";
import { creatorGamePreviewPath } from "./creator-game-route-contract.ts";

const MAX_PACKAGE_REVISIONS_PER_GAME = 100;

type GamePackageRelease = {
  sdkPackageVersion: string;
  supportedSdkContractVersions: readonly number[];
};

export function isGamePackageReleaseSupported(input: {
  sdkPackageVersion: string;
  sdkContractVersion: number;
}, release: GamePackageRelease = platformRelease) {
  return input.sdkPackageVersion === release.sdkPackageVersion
    && release.supportedSdkContractVersions.includes(input.sdkContractVersion);
}

export function candidatePackagePreviewPath(input: {
  creatorSlug: string;
  gameId: string;
  revision: string;
}) {
  return creatorGamePreviewPath(input);
}

export type SavedGamePackage = {
  saved: true;
  gameId: string;
  packageRevision: string;
  candidatePreviewPath: string;
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
  validatedPackage?: ValidatedGamePackage;
  authoringBinding: {
    environment: "production" | "development";
    moduleProfileRevision: string;
    moduleContractDigest: string;
    prototypeRevision: string;
    sharedSourceSha256: string;
  };
}, dependencies: {
  ensureSchema?: typeof ensureSdkSchema;
  sql?: ReturnType<typeof sdkSql>;
  saveFiles?: typeof saveGamePackageFilesToGit;
} = {}): Promise<SavedGamePackage> {
  const files = input.validatedPackage
    ? input.validatedPackage.files
    : prepareGamePackageUploadFiles(input.files);
  const ensureSchema = dependencies.ensureSchema ?? ensureSdkSchema;
  const saveFiles = dependencies.saveFiles ?? saveGamePackageFilesToGit;
  return saveValidatedGamePackage({
    files,
    validatedPackage: input.validatedPackage,
    afterValidation: () => {
      const parsed = parseGameFieldsPackageManifest({
        gameId: input.gameId,
        files,
      });
      if (!isGamePackageReleaseSupported(parsed.manifest)) {
        throw new Error("GAME_SDK_PACKAGE_RELEASE_MISMATCH");
      }
      if (
        parsed.manifest.authoring?.environment !== input.authoringBinding.environment
        || parsed.manifest.authoring.moduleProfileRevision !== input.authoringBinding.moduleProfileRevision
        || parsed.manifest.authoring.moduleContractDigest !== input.authoringBinding.moduleContractDigest
        || parsed.manifest.authoring.prototypeRevision !== input.authoringBinding.prototypeRevision
        || parsed.manifest.authoring.sharedSourceSha256 !== input.authoringBinding.sharedSourceSha256
      ) {
        throw new Error("GAME_SDK_PACKAGE_AUTHORING_BINDING_MISMATCH");
      }
      return parsed;
    },
    persist: async (validated, parsed) => {
  const database = dependencies.sql ?? sdkSql();
  await ensureSchema();
  const existingRows = await database`
    SELECT r.revision,
           r.package_root_sha256 AS "packageRootSha256",
           r.server_bundle_sha256 AS "serverBundleSha256",
           r.app_set_source_sha256 AS "appSetSourceSha256"
    FROM sdk_game_package_revisions r
    JOIN sdk_games g ON g.id = r.game_id
    WHERE g.creator_id = ${input.creatorId}
      AND g.game_id = ${input.gameId}
      AND r.package_root_sha256 = ${parsed.packageRootSha256}
      AND r.module_profile_revision = ${input.authoringBinding.moduleProfileRevision}::uuid
      AND r.module_contract_digest = ${input.authoringBinding.moduleContractDigest}
      AND r.prototype_revision = ${input.authoringBinding.prototypeRevision}
      AND r.shared_source_sha256 = ${input.authoringBinding.sharedSourceSha256}
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
      candidatePreviewPath: candidatePackagePreviewPath({
        creatorSlug: input.creatorSlug,
        gameId: input.gameId,
        revision: existing.revision,
      }),
      packageRootSha256: existing.packageRootSha256,
      serverBundleSha256: existing.serverBundleSha256,
      appSetSourceSha256: existing.appSetSourceSha256,
      status: "ready-for-submission",
    };
  }

  const revisionCountRows = await database`
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

  const revision = await saveFiles({
    instanceId: input.creatorSlug,
    gameId: input.gameId,
    files,
    validatedPackage: validated,
  });
  const manifestJson = JSON.stringify(parsed.manifest.manifest);
  const revisionRows = await database`
    INSERT INTO sdk_game_package_revisions (
      game_id, revision, package_root_sha256, server_bundle_sha256,
      app_set_source_sha256, manifest, sdk_package_version,
      sdk_contract_version, module_profile_revision,
      module_contract_digest, prototype_revision, shared_source_sha256
    )
    SELECT id, ${revision}, ${parsed.packageRootSha256}, ${parsed.bundleSha256},
           ${parsed.appSetSourceSha256}, ${manifestJson}::jsonb,
           ${parsed.manifest.sdkPackageVersion},
           ${parsed.manifest.sdkContractVersion},
           ${input.authoringBinding.moduleProfileRevision},
           ${input.authoringBinding.moduleContractDigest},
           ${input.authoringBinding.prototypeRevision},
           ${input.authoringBinding.sharedSourceSha256}
    FROM sdk_games
    WHERE creator_id = ${input.creatorId} AND game_id = ${input.gameId}
      AND module_profile_revision = ${input.authoringBinding.moduleProfileRevision}::uuid
      AND module_contract_digest = ${input.authoringBinding.moduleContractDigest}
      AND mock_approved_revision = ${input.authoringBinding.prototypeRevision}
      AND prototype_source_sha256 = ${input.authoringBinding.sharedSourceSha256}
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
    candidatePreviewPath: candidatePackagePreviewPath({
      creatorSlug: input.creatorSlug,
      gameId: input.gameId,
      revision,
    }),
    packageRootSha256: parsed.packageRootSha256,
    serverBundleSha256: parsed.bundleSha256,
    appSetSourceSha256: parsed.appSetSourceSha256,
    status: "ready-for-submission",
  };
    },
  });
}
