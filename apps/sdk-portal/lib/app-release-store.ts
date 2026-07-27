import { createPackageRuntimeAccess } from "./preview-links";
import { jsonValuesEqual } from "./canonical-json";
import { ensureSdkSchema, sdkSql } from "./sdk-postgres";
import { GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION } from "@game-fields/game-sdk/portable-server";
import {
  AppReleaseArtifactTransferError,
  transferDevelopmentPackageArtifact,
} from "./app-release-artifact-transfer";

const ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const REVISION = /^[a-f0-9]{40}$/;
const SHA = /^[a-f0-9]{64}$/;

export type AppReleaseSnapshot = {
  lineageId: string;
  publicGameId: string;
  sourceCreatorSlug: string;
  sourceGameId: string;
  title: string;
  description: string;
  revision: string;
  sourceRevision?: string;
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  manifest: unknown;
  modulePolicy: unknown;
};

export class AppReleaseError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
  }
}

function validSnapshot(value: unknown): value is AppReleaseSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AppReleaseSnapshot>;
  return typeof item.lineageId === "string"
    && item.lineageId === `${item.sourceCreatorSlug}/${item.sourceGameId}`
    && typeof item.sourceCreatorSlug === "string" && ID.test(item.sourceCreatorSlug)
    && typeof item.sourceGameId === "string" && ID.test(item.sourceGameId)
    && typeof item.publicGameId === "string" && ID.test(item.publicGameId)
    && typeof item.title === "string" && item.title.length > 0 && item.title.length <= 120
    && typeof item.description === "string" && item.description.length <= 500
    && typeof item.revision === "string" && REVISION.test(item.revision)
    && (
      item.sourceRevision === undefined
      || (typeof item.sourceRevision === "string" && REVISION.test(item.sourceRevision))
    )
    && typeof item.packageRootSha256 === "string" && SHA.test(item.packageRootSha256)
    && typeof item.serverBundleSha256 === "string" && SHA.test(item.serverBundleSha256)
    && typeof item.appSetSourceSha256 === "string" && SHA.test(item.appSetSourceSha256)
    && Boolean(item.manifest) && typeof item.modulePolicy === "object";
}

async function verifyRuntime(
  snapshot: AppReleaseSnapshot,
  revision = snapshot.revision,
) {
  const access = createPackageRuntimeAccess({
    instanceId: snapshot.sourceCreatorSlug,
    gameId: snapshot.sourceGameId,
    revision,
    serverBundleSha256: snapshot.serverBundleSha256,
    channel: "main",
  });
  const response = await fetch(access.serverRuntimeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access.serverRuntimeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
      invocation: { operation: "manifest" },
      effects: {},
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as {
    ok?: unknown;
    value?: unknown;
    error?: unknown;
  } | null;
  if (!response.ok) {
    const upstream = typeof payload?.error === "string" ? payload.error : "UNKNOWN";
    throw new AppReleaseError(
      "APP_RELEASE_RUNTIME_MANIFEST_MISMATCH",
      422,
      `RUNTIME_HTTP_${response.status}_${upstream}`,
    );
  }
  if (payload?.ok !== true) {
    throw new AppReleaseError(
      "APP_RELEASE_RUNTIME_MANIFEST_MISMATCH",
      422,
      "RUNTIME_PAYLOAD_NOT_OK",
    );
  }
  if (!jsonValuesEqual(payload.value, snapshot.manifest)) {
    throw new AppReleaseError(
      "APP_RELEASE_RUNTIME_MANIFEST_MISMATCH",
      422,
      "RUNTIME_MANIFEST_VALUE_MISMATCH",
    );
  }
}

async function transferArtifact(snapshot: AppReleaseSnapshot) {
  try {
    return await transferDevelopmentPackageArtifact({
      sourceCreatorSlug: snapshot.sourceCreatorSlug,
      sourceGameId: snapshot.sourceGameId,
      revision: snapshot.sourceRevision ?? snapshot.revision,
      packageRootSha256: snapshot.packageRootSha256,
      serverBundleSha256: snapshot.serverBundleSha256,
      appSetSourceSha256: snapshot.appSetSourceSha256,
      manifest: snapshot.manifest,
    });
  } catch (error) {
    if (error instanceof AppReleaseArtifactTransferError) {
      throw new AppReleaseError(error.code, error.status, error.detail);
    }
    throw error;
  }
}

export async function listCurrentAppReleases() {
  await ensureSdkSchema();
  return sdkSql()`
    SELECT id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
           source_creator_slug AS "sourceCreatorSlug",
           source_game_id AS "sourceGameId", title, description, revision,
           source_revision AS "sourceRevision",
           package_root_sha256 AS "packageRootSha256",
           server_bundle_sha256 AS "serverBundleSha256",
           app_set_source_sha256 AS "appSetSourceSha256",
           manifest, module_policy AS "modulePolicy",
           source_environment AS "sourceEnvironment",
           (
             source_environment <> 'development'
             OR revision <> source_revision
           ) AS "artifactTransferred",
           release_kind AS "releaseKind", restored_from AS "restoredFrom",
           released_at AS "releasedAt"
    FROM sdk_app_releases WHERE is_current
    ORDER BY released_at DESC
  `;
}

export async function listAppReleaseHistory(lineageId?: string) {
  await ensureSdkSchema();
  return lineageId
    ? sdkSql()`
        SELECT id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
               title, revision, source_revision AS "sourceRevision",
               package_root_sha256 AS "packageRootSha256",
               source_environment AS "sourceEnvironment",
               release_kind AS "releaseKind", restored_from AS "restoredFrom",
               released_at AS "releasedAt", is_current AS "isCurrent"
        FROM sdk_app_releases WHERE lineage_id = ${lineageId}
        ORDER BY released_at DESC LIMIT 100
      `
    : [];
}

export async function promoteAppRelease(snapshotValue: unknown) {
  if (!validSnapshot(snapshotValue)) {
    throw new AppReleaseError("APP_RELEASE_INPUT_INVALID", 400);
  }
  const snapshot = snapshotValue;
  await ensureSdkSchema();
  const currentRows = await sdkSql()`
    SELECT public_game_id AS "publicGameId"
    FROM sdk_app_releases
    WHERE lineage_id = ${snapshot.lineageId} AND is_current
    LIMIT 1
  `;
  const current = Array.isArray(currentRows)
    ? currentRows[0] as { publicGameId?: string } | undefined
    : undefined;
  const publicGameId = current?.publicGameId ?? snapshot.publicGameId;
  const artifact = await transferArtifact(snapshot);
  await verifyRuntime(snapshot, artifact.revision);
  const manifest = JSON.stringify(snapshot.manifest);
  const modulePolicy = JSON.stringify(snapshot.modulePolicy);
  const rows = await sdkSql().transaction([
    sdkSql()`UPDATE sdk_app_releases SET is_current = FALSE
             WHERE lineage_id = ${snapshot.lineageId} AND is_current`,
    sdkSql()`INSERT INTO sdk_app_releases (
      lineage_id, public_game_id, source_creator_slug, source_game_id,
      title, description, revision, source_revision,
      package_root_sha256, server_bundle_sha256,
      app_set_source_sha256, manifest, module_policy, source_environment,
      release_kind
    ) VALUES (
      ${snapshot.lineageId}, ${publicGameId},
      ${snapshot.sourceCreatorSlug}, ${snapshot.sourceGameId},
      ${snapshot.title}, ${snapshot.description}, ${artifact.revision},
      ${artifact.sourceRevision},
      ${snapshot.packageRootSha256}, ${snapshot.serverBundleSha256},
      ${snapshot.appSetSourceSha256}, ${manifest}::jsonb,
      ${modulePolicy}::jsonb, 'development', 'promotion'
    ) RETURNING id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
                revision, source_revision AS "sourceRevision",
                released_at AS "releasedAt"`,
  ]);
  return Array.isArray(rows) && Array.isArray(rows[1]) ? rows[1][0] : null;
}

export async function rollbackAppRelease(lineageId: string, releaseId: string) {
  if (!lineageId || !/^[0-9a-f-]{36}$/.test(releaseId)) {
    throw new AppReleaseError("APP_RELEASE_INPUT_INVALID", 400);
  }
  await ensureSdkSchema();
  const sourceRows = await sdkSql()`
    SELECT id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
           source_creator_slug AS "sourceCreatorSlug",
           source_game_id AS "sourceGameId", title, description, revision,
           source_revision AS "sourceRevision",
           package_root_sha256 AS "packageRootSha256",
           server_bundle_sha256 AS "serverBundleSha256",
           app_set_source_sha256 AS "appSetSourceSha256",
           manifest, module_policy AS "modulePolicy",
           source_environment AS "sourceEnvironment"
    FROM sdk_app_releases
    WHERE id = ${releaseId} AND lineage_id = ${lineageId} LIMIT 1
  `;
  const source = Array.isArray(sourceRows)
    ? sourceRows[0] as (
        AppReleaseSnapshot & {
          id: string;
          sourceRevision: string;
          sourceEnvironment: "development" | "main" | "legacy";
        }
      ) | undefined
    : undefined;
  if (!source) throw new AppReleaseError("APP_RELEASE_NOT_FOUND", 404);
  const currentRows = await sdkSql()`
    SELECT public_game_id AS "publicGameId"
    FROM sdk_app_releases
    WHERE lineage_id = ${lineageId} AND is_current
    LIMIT 1
  `;
  const current = Array.isArray(currentRows)
    ? currentRows[0] as { publicGameId?: string } | undefined
    : undefined;
  const currentPublicGameId = current?.publicGameId;
  if (!currentPublicGameId) {
    throw new AppReleaseError("APP_RELEASE_CURRENT_NOT_FOUND", 409);
  }
  const artifact = source.sourceEnvironment === "development"
    ? await transferArtifact(source)
    : {
        revision: source.revision,
        sourceRevision: source.sourceRevision,
      };
  await verifyRuntime(source, artifact.revision);
  const manifest = JSON.stringify(source.manifest);
  const modulePolicy = JSON.stringify(source.modulePolicy);
  const rows = await sdkSql().transaction([
    sdkSql()`UPDATE sdk_app_releases SET is_current = FALSE
             WHERE lineage_id = ${lineageId} AND is_current`,
    sdkSql()`INSERT INTO sdk_app_releases (
      lineage_id, public_game_id, source_creator_slug, source_game_id,
      title, description, revision, source_revision,
      package_root_sha256, server_bundle_sha256,
      app_set_source_sha256, manifest, module_policy, source_environment,
      release_kind, restored_from
    ) VALUES (
      ${source.lineageId}, ${currentPublicGameId},
      ${source.sourceCreatorSlug}, ${source.sourceGameId},
      ${source.title}, ${source.description}, ${artifact.revision},
      ${artifact.sourceRevision}, ${source.packageRootSha256},
      ${source.serverBundleSha256}, ${source.appSetSourceSha256},
      ${manifest}::jsonb, ${modulePolicy}::jsonb,
      ${source.sourceEnvironment}, 'rollback', ${source.id}
    )
    RETURNING id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
              revision, source_revision AS "sourceRevision",
              released_at AS "releasedAt"`,
  ]);
  return Array.isArray(rows) && Array.isArray(rows[1]) ? rows[1][0] : null;
}
