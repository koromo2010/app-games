import { createPackageRuntimeAccess } from "./preview-links";
import { jsonValuesEqual } from "./canonical-json";
import { ensureSdkSchema, sdkSql } from "./sdk-postgres";
import {
  normalizeReleaseDecision,
} from "./release-decision";
import { GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION } from "@game-fields/game-sdk/portable-server";

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
  packageRootSha256: string;
  serverBundleSha256: string;
  appSetSourceSha256: string;
  manifest: unknown;
  modulePolicy: unknown;
};

export class AppReleaseError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
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
    && typeof item.packageRootSha256 === "string" && SHA.test(item.packageRootSha256)
    && typeof item.serverBundleSha256 === "string" && SHA.test(item.serverBundleSha256)
    && typeof item.appSetSourceSha256 === "string" && SHA.test(item.appSetSourceSha256)
    && Boolean(item.manifest) && typeof item.modulePolicy === "object";
}

function normalizedDecision(value: unknown) {
  const decision = normalizeReleaseDecision(value);
  if (!decision) {
    throw new AppReleaseError("APP_RELEASE_DECISION_INVALID", 400);
  }
  return decision;
}

async function verifyRuntime(snapshot: AppReleaseSnapshot) {
  const access = createPackageRuntimeAccess({
    instanceId: snapshot.sourceCreatorSlug,
    gameId: snapshot.sourceGameId,
    revision: snapshot.revision,
    serverBundleSha256: snapshot.serverBundleSha256,
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
  const payload = await response.json().catch(() => null) as { ok?: unknown; value?: unknown } | null;
  if (!response.ok || payload?.ok !== true || !jsonValuesEqual(payload.value, snapshot.manifest)) {
    throw new AppReleaseError("APP_RELEASE_RUNTIME_MANIFEST_MISMATCH", 422);
  }
}

export async function listCurrentAppReleases() {
  await ensureSdkSchema();
  return sdkSql()`
    SELECT id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
           source_creator_slug AS "sourceCreatorSlug",
           source_game_id AS "sourceGameId", title, description, revision,
           package_root_sha256 AS "packageRootSha256",
           server_bundle_sha256 AS "serverBundleSha256",
           app_set_source_sha256 AS "appSetSourceSha256",
           manifest, module_policy AS "modulePolicy",
           source_environment AS "sourceEnvironment",
           release_kind AS "releaseKind", restored_from AS "restoredFrom",
           released_at AS "releasedAt",
           decision.action AS "decisionAction",
           decision.reason AS "decisionReason",
           decision.actor_ref AS "decisionActor",
           decision.decided_at AS "decisionAt"
    FROM sdk_app_releases release
    LEFT JOIN LATERAL (
      SELECT action, reason, actor_ref, decided_at
      FROM sdk_release_decisions
      WHERE release_id = release.id
      ORDER BY decided_at DESC
      LIMIT 1
    ) decision ON TRUE
    WHERE release.is_current
    ORDER BY released_at DESC
  `;
}

export async function listAppReleaseHistory(lineageId?: string) {
  await ensureSdkSchema();
  return lineageId
    ? sdkSql()`
        SELECT id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
               title, revision, package_root_sha256 AS "packageRootSha256",
               source_environment AS "sourceEnvironment",
               release_kind AS "releaseKind", restored_from AS "restoredFrom",
               released_at AS "releasedAt", is_current AS "isCurrent",
               decision.action AS "decisionAction",
               decision.reason AS "decisionReason",
               decision.actor_ref AS "decisionActor",
               decision.decided_at AS "decisionAt"
        FROM sdk_app_releases release
        LEFT JOIN LATERAL (
          SELECT action, reason, actor_ref, decided_at
          FROM sdk_release_decisions
          WHERE release_id = release.id
          ORDER BY decided_at DESC
          LIMIT 1
        ) decision ON TRUE
        WHERE release.lineage_id = ${lineageId}
        ORDER BY released_at DESC LIMIT 100
      `
    : [];
}

export async function listAppReleaseDecisions(lineageId?: string) {
  await ensureSdkSchema();
  return lineageId
    ? sdkSql()`
        SELECT id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
               route, action, source_environment AS "sourceEnvironment",
               target_environment AS "targetEnvironment", revision,
               package_root_sha256 AS "packageRootSha256",
               reason, actor_ref AS "actorRef", release_id AS "releaseId",
               decided_at AS "decidedAt"
        FROM sdk_release_decisions
        WHERE lineage_id = ${lineageId}
        ORDER BY decided_at DESC LIMIT 100
      `
    : sdkSql()`
        SELECT id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
               route, action, source_environment AS "sourceEnvironment",
               target_environment AS "targetEnvironment", revision,
               package_root_sha256 AS "packageRootSha256",
               reason, actor_ref AS "actorRef", release_id AS "releaseId",
               decided_at AS "decidedAt"
        FROM sdk_release_decisions
        WHERE route = 'dev-app'
        ORDER BY decided_at DESC LIMIT 100
      `;
}

export async function promoteAppRelease(
  snapshotValue: unknown,
  decisionValue: unknown,
) {
  if (!validSnapshot(snapshotValue)) {
    throw new AppReleaseError("APP_RELEASE_INPUT_INVALID", 400);
  }
  const snapshot = snapshotValue;
  const decision = normalizedDecision(decisionValue);
  await verifyRuntime(snapshot);
  await ensureSdkSchema();
  const manifest = JSON.stringify(snapshot.manifest);
  const modulePolicy = JSON.stringify(snapshot.modulePolicy);
  const rows = await sdkSql()`
    WITH current_release AS (
      SELECT public_game_id
      FROM sdk_app_releases
      WHERE lineage_id = ${snapshot.lineageId} AND is_current
      LIMIT 1
      FOR UPDATE
    ),
    previous_release AS (
      UPDATE sdk_app_releases
      SET is_current = FALSE
      WHERE lineage_id = ${snapshot.lineageId} AND is_current
      RETURNING id
    ),
    release_gate AS (
      SELECT COUNT(*) AS previous_count FROM previous_release
    ),
    new_release AS (
      INSERT INTO sdk_app_releases (
        lineage_id, public_game_id, source_creator_slug, source_game_id,
        title, description, revision, package_root_sha256, server_bundle_sha256,
        app_set_source_sha256, manifest, module_policy, source_environment,
        release_kind
      )
      SELECT ${snapshot.lineageId},
             COALESCE(
               (SELECT public_game_id FROM current_release),
               ${snapshot.publicGameId}
             ),
             ${snapshot.sourceCreatorSlug}, ${snapshot.sourceGameId},
             ${snapshot.title}, ${snapshot.description}, ${snapshot.revision},
             ${snapshot.packageRootSha256}, ${snapshot.serverBundleSha256},
             ${snapshot.appSetSourceSha256}, ${manifest}::jsonb,
             ${modulePolicy}::jsonb, 'development', 'promotion'
      FROM release_gate
      RETURNING id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
                revision, released_at AS "releasedAt"
    ),
    release_decision AS (
      INSERT INTO sdk_release_decisions (
        lineage_id, public_game_id, route, action,
        source_environment, target_environment, revision,
        package_root_sha256, server_bundle_sha256, app_set_source_sha256,
        reason, actor_ref, release_id
      )
      SELECT ${snapshot.lineageId}, new_release."publicGameId",
             'dev-app', 'approve', 'development', 'main',
             ${snapshot.revision}, ${snapshot.packageRootSha256},
             ${snapshot.serverBundleSha256}, ${snapshot.appSetSourceSha256},
             ${decision.reason}, ${decision.actorRef}, new_release.id
      FROM new_release
      RETURNING id AS "decisionId", decided_at AS "decisionAt"
    )
    SELECT new_release.*, release_decision."decisionId",
           release_decision."decisionAt"
    FROM new_release
    JOIN release_decision ON TRUE
  `;
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

export async function rejectAppRelease(
  snapshotValue: unknown,
  decisionValue: unknown,
) {
  if (!validSnapshot(snapshotValue)) {
    throw new AppReleaseError("APP_RELEASE_INPUT_INVALID", 400);
  }
  const snapshot = snapshotValue;
  const decision = normalizedDecision(decisionValue);
  await ensureSdkSchema();
  const rows = await sdkSql()`
    INSERT INTO sdk_release_decisions (
      lineage_id, public_game_id, route, action,
      source_environment, target_environment, revision,
      package_root_sha256, server_bundle_sha256, app_set_source_sha256,
      reason, actor_ref
    )
    SELECT ${snapshot.lineageId},
           COALESCE((
             SELECT public_game_id
             FROM sdk_app_releases
             WHERE lineage_id = ${snapshot.lineageId} AND is_current
             LIMIT 1
           ), ${snapshot.publicGameId}),
           'dev-app', 'reject', 'development', 'main', ${snapshot.revision},
           ${snapshot.packageRootSha256}, ${snapshot.serverBundleSha256},
           ${snapshot.appSetSourceSha256}, ${decision.reason},
           ${decision.actorRef}
    RETURNING id AS "decisionId", decided_at AS "decisionAt"
  `;
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

export async function rollbackAppRelease(
  lineageId: string,
  releaseId: string,
  decisionValue: unknown,
) {
  if (!lineageId || !/^[0-9a-f-]{36}$/.test(releaseId)) {
    throw new AppReleaseError("APP_RELEASE_INPUT_INVALID", 400);
  }
  const decision = normalizedDecision(decisionValue);
  await ensureSdkSchema();
  const sourceRows = await sdkSql()`
    SELECT * FROM sdk_app_releases
    WHERE id = ${releaseId} AND lineage_id = ${lineageId} LIMIT 1
  `;
  const source = Array.isArray(sourceRows)
    ? sourceRows[0] as Record<string, unknown> | undefined
    : undefined;
  if (!source) throw new AppReleaseError("APP_RELEASE_NOT_FOUND", 404);
  const rows = await sdkSql()`
    WITH current_release AS (
      SELECT public_game_id
      FROM sdk_app_releases
      WHERE lineage_id = ${lineageId} AND is_current
      LIMIT 1
      FOR UPDATE
    ),
    previous_release AS (
      UPDATE sdk_app_releases
      SET is_current = FALSE
      WHERE lineage_id = ${lineageId}
        AND is_current
        AND EXISTS (SELECT 1 FROM current_release)
      RETURNING id
    ),
    release_gate AS (
      SELECT COUNT(*) AS previous_count FROM previous_release
    ),
    new_release AS (
      INSERT INTO sdk_app_releases (
        lineage_id, public_game_id, source_creator_slug, source_game_id,
        title, description, revision, package_root_sha256, server_bundle_sha256,
        app_set_source_sha256, manifest, module_policy, source_environment,
        release_kind, restored_from
      )
      SELECT source.lineage_id, current_release.public_game_id,
        source.source_creator_slug, source.source_game_id,
        source.title, source.description, source.revision,
        source.package_root_sha256, source.server_bundle_sha256,
        source.app_set_source_sha256, source.manifest, source.module_policy,
        source.source_environment, 'rollback', source.id
      FROM sdk_app_releases source
      CROSS JOIN release_gate
      CROSS JOIN current_release
      WHERE source.id = ${releaseId} AND source.lineage_id = ${lineageId}
      RETURNING id, lineage_id AS "lineageId", public_game_id AS "publicGameId",
                revision, package_root_sha256 AS "packageRootSha256",
                server_bundle_sha256 AS "serverBundleSha256",
                app_set_source_sha256 AS "appSetSourceSha256",
                source_environment AS "sourceEnvironment",
                released_at AS "releasedAt"
    ),
    release_decision AS (
      INSERT INTO sdk_release_decisions (
        lineage_id, public_game_id, route, action,
        source_environment, target_environment, revision,
        package_root_sha256, server_bundle_sha256, app_set_source_sha256,
        reason, actor_ref, release_id
      )
      SELECT new_release."lineageId", new_release."publicGameId",
             'dev-app', 'rollback', new_release."sourceEnvironment", 'main',
             new_release.revision, new_release."packageRootSha256",
             new_release."serverBundleSha256",
             new_release."appSetSourceSha256",
             ${decision.reason}, ${decision.actorRef}, new_release.id
      FROM new_release
      RETURNING id AS "decisionId", decided_at AS "decisionAt"
    )
    SELECT new_release.*, release_decision."decisionId",
           release_decision."decisionAt"
    FROM new_release
    JOIN release_decision ON TRUE
  `;
  const restored = Array.isArray(rows) ? rows[0] ?? null : null;
  if (!restored) {
    throw new AppReleaseError("APP_RELEASE_CURRENT_NOT_FOUND", 409);
  }
  return restored;
}
