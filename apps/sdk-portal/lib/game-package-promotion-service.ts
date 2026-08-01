import {
  GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
} from "@game-fields/game-sdk/portable-server";
import { createPackageRuntimeAccess } from "./preview-links";
import {
  assertExpectedGamePackageSource,
  gamePackagePromotionReleaseRevisions,
  gamePackagePromotionSource,
  GamePackagePromotionError,
  type ExpectedGamePackageSource,
  type GamePackagePromotionTarget,
} from "./game-package-promotion";
import {
  logGamePackagePromotionFailure,
  type GamePackagePromotionFailureContext,
} from "./game-package-promotion-observability";
import { jsonValuesEqual } from "./canonical-json";
import {
  normalizeReleaseDecision,
  type ReleaseDecisionInput,
} from "./release-decision";
import { ensureSdkSchema, sdkSql } from "./sdk-postgres";

export { promotionErrorResponse } from "./game-package-promotion";

const IDENTIFIER_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type PromoteGamePackageInput = {
  creatorSlug: string;
  gameId: string;
  publicGameId: string;
  target: "development" | "main";
  expectedSource?: ExpectedGamePackageSource;
  decision: ReleaseDecisionInput;
};

type PromotionTarget = GamePackagePromotionTarget & {
  creatorSlug: string;
  gameId: string;
};

function normalizeDecision(input: ReleaseDecisionInput) {
  const decision = normalizeReleaseDecision(input);
  if (!decision) {
    throw new GamePackagePromotionError("promotion_decision_invalid", 400);
  }
  return decision;
}

function normalizedInput(
  input: Omit<PromoteGamePackageInput, "publicGameId"> & {
    publicGameId?: string;
  },
) {
  const creatorSlug = input.creatorSlug.trim().toLowerCase();
  const gameId = input.gameId.trim().toLowerCase();
  const publicGameId = input.publicGameId?.trim().toLowerCase() ?? "";
  if (
    !IDENTIFIER_PATTERN.test(creatorSlug)
    || !IDENTIFIER_PATTERN.test(gameId)
    || (publicGameId && !IDENTIFIER_PATTERN.test(publicGameId))
  ) {
    throw new GamePackagePromotionError("promotion_input_invalid", 400);
  }
  const expected = input.expectedSource;
  if (expected && (
    !REVISION_PATTERN.test(expected.revision)
    || !SHA256_PATTERN.test(expected.packageRootSha256)
    || !SHA256_PATTERN.test(expected.serverBundleSha256)
    || !SHA256_PATTERN.test(expected.appSetSourceSha256)
  )) {
    throw new GamePackagePromotionError("promotion_expected_source_invalid", 400);
  }
  return {
    creatorSlug,
    gameId,
    publicGameId,
    expected,
    decision: normalizeDecision(input.decision),
  };
}

async function verifyPortableManifest(target: {
  creatorSlug: string;
  gameId: string;
  revision: string;
  bundleSha256: string;
  manifest: unknown;
}) {
  const access = createPackageRuntimeAccess({
    instanceId: target.creatorSlug,
    gameId: target.gameId,
    revision: target.revision,
    serverBundleSha256: target.bundleSha256,
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
  } | null;
  if (
    !response.ok
    || payload?.ok !== true
    || !jsonValuesEqual(payload.value, target.manifest)
  ) {
    throw new GamePackagePromotionError(
      "GAME_SDK_PACKAGE_RUNTIME_MANIFEST_MISMATCH",
      422,
    );
  }
}

async function promoteGamePackageInner(
  input: PromoteGamePackageInput,
  failureContext: GamePackagePromotionFailureContext,
) {
  const {
    creatorSlug,
    gameId,
    publicGameId,
    expected,
    decision,
  } = normalizedInput(input);
  failureContext.creatorSlug = creatorSlug;
  failureContext.gameId = gameId;
  if (!publicGameId) {
    throw new GamePackagePromotionError("promotion_input_invalid", 400);
  }
  failureContext.stage = "schema_validation";
  await ensureSdkSchema();
  failureContext.stage = "source_lookup";
  const targets = await sdkSql()`
    SELECT c.slug AS "creatorSlug", g.game_id AS "gameId", g.manifest,
           g.package_revision AS "packageRevision",
           g.package_root_sha256 AS "packageRootSha256",
           g.package_bundle_sha256 AS "packageBundleSha256",
           g.package_app_set_sha256 AS "packageAppSetSha256"
    FROM sdk_games g
    JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${creatorSlug} AND g.game_id = ${gameId}
      AND g.deleted_at IS NULL
    LIMIT 1
  `;
  const target = (Array.isArray(targets) ? targets[0] : null) as
    | PromotionTarget
    | null;
  if (!target) {
    throw new GamePackagePromotionError("promotion_target_not_found", 404);
  }
  const source = gamePackagePromotionSource(target);
  if (!source) {
    throw new GamePackagePromotionError("promotion_source_missing", 409);
  }
  assertExpectedGamePackageSource(source, expected);
  const {
    revision,
    packageRootSha256,
    bundleSha256,
    appSetSha256,
    manifest,
  } = source;
  const {
    revision: releaseRevision,
    sourceRevision,
  } = gamePackagePromotionReleaseRevisions(source);
  failureContext.sourceRevision = sourceRevision;
  failureContext.stage = "manifest_verification";
  await verifyPortableManifest({
    creatorSlug,
    gameId,
    revision,
    bundleSha256,
    manifest,
  });
  const manifestJson = JSON.stringify(manifest);
  const lineageId = `${creatorSlug}/${gameId}`;
  failureContext.stage = "release_write";
  // Keep the stable pointer, release history, and decision in one PostgreSQL
  // statement so any failed CTE write rolls the entire adoption back.
  const rows = await sdkSql()`
    WITH source AS (
      SELECT g.id, g.title, g.description, g.module_policy
      FROM sdk_games g
      JOIN sdk_creators c ON c.id = g.creator_id
      WHERE c.slug = ${creatorSlug}
        AND g.game_id = ${gameId}
        AND g.deleted_at IS NULL
        AND g.package_revision = ${revision}
        AND g.package_root_sha256 = ${packageRootSha256}
        AND g.package_bundle_sha256 = ${bundleSha256}
        AND g.package_app_set_sha256 = ${appSetSha256}
      FOR UPDATE
    ),
    updated_game AS (
      UPDATE sdk_games g
      SET public_game_id = ${publicGameId},
          stable_revision = ${revision},
          stable_root_sha256 = ${packageRootSha256},
          stable_bundle_sha256 = ${bundleSha256},
          stable_app_set_sha256 = ${appSetSha256},
          stable_manifest = ${manifestJson}::jsonb,
          status = 'stable',
          updated_at = NOW()
      FROM source
      WHERE g.id = source.id
      RETURNING g.id, g.public_game_id AS "publicGameId",
                g.stable_revision AS revision,
                g.stable_root_sha256 AS "packageRootSha256",
                g.stable_bundle_sha256 AS "serverBundleSha256",
                g.stable_app_set_sha256 AS "appSetSourceSha256"
    ),
    channel_history AS (
      INSERT INTO sdk_game_channel_history (
        game_id, channel, revision, package_root_sha256
      )
      SELECT id, 'stable', revision, "packageRootSha256"
      FROM updated_game
      ON CONFLICT (game_id, channel, revision) DO NOTHING
    ),
    previous_release AS (
      UPDATE sdk_app_releases
      SET is_current = FALSE
      WHERE lineage_id = ${lineageId}
        AND is_current
        AND EXISTS (SELECT 1 FROM updated_game)
      RETURNING id
    ),
    release_gate AS (
      SELECT COUNT(*) AS previous_count FROM previous_release
    ),
    new_release AS (
      INSERT INTO sdk_app_releases (
        lineage_id, public_game_id, source_creator_slug, source_game_id,
        title, description, revision, source_revision, package_root_sha256,
        server_bundle_sha256, app_set_source_sha256, manifest, module_policy,
        source_environment, release_kind
      )
      SELECT ${lineageId}, ${publicGameId}, ${creatorSlug}, ${gameId},
             source.title, source.description, ${releaseRevision},
             ${sourceRevision}, ${packageRootSha256}, ${bundleSha256},
             ${appSetSha256}, ${manifestJson}::jsonb, source.module_policy,
             ${input.target}, 'promotion'
      FROM source
      JOIN updated_game ON updated_game.id = source.id
      CROSS JOIN release_gate
      RETURNING id
    ),
    decision AS (
      INSERT INTO sdk_release_decisions (
        lineage_id, public_game_id, route, action,
        source_environment, target_environment, revision,
        package_root_sha256, server_bundle_sha256, app_set_source_sha256,
        reason, actor_ref, release_id
      )
      SELECT ${lineageId}, ${publicGameId}, 'sdk-candidate', 'approve',
             ${input.target}, ${input.target}, ${revision},
             ${packageRootSha256}, ${bundleSha256}, ${appSetSha256},
             ${decision.reason}, ${decision.actorRef}, new_release.id
      FROM new_release
      RETURNING id, decided_at AS "decidedAt"
    )
    SELECT updated_game.*, new_release.id AS "releaseId",
           decision.id AS "decisionId", decision."decidedAt"
    FROM updated_game
    JOIN new_release ON TRUE
    JOIN decision ON TRUE
  `;
  failureContext.stage = "result_validation";
  const promoted = Array.isArray(rows) ? rows[0] : null;
  if (!promoted) {
    throw new GamePackagePromotionError("promotion_source_changed", 409);
  }
  return {
    promoted: true as const,
    target: input.target,
    creatorSlug,
    gameId,
    ...(promoted as {
      publicGameId: string;
      revision: string;
      packageRootSha256: string;
      serverBundleSha256: string;
      appSetSourceSha256: string;
      releaseId: string;
      decisionId: string;
      decidedAt: string;
    }),
  };
}

export async function promoteGamePackage(input: PromoteGamePackageInput) {
  const failureContext: GamePackagePromotionFailureContext = {
    stage: "input_validation",
    targetEnvironment: input.target === "development" || input.target === "main"
      ? input.target
      : undefined,
  };
  try {
    return await promoteGamePackageInner(input, failureContext);
  } catch (error) {
    logGamePackagePromotionFailure(failureContext, error);
    throw error;
  }
}

export async function rejectGamePackage(input: Omit<PromoteGamePackageInput, "publicGameId">) {
  const {
    creatorSlug,
    gameId,
    expected,
    decision,
  } = normalizedInput(input);
  await ensureSdkSchema();
  const targets = await sdkSql()`
    SELECT c.slug AS "creatorSlug", g.game_id AS "gameId", g.manifest,
           g.package_revision AS "packageRevision",
           g.package_root_sha256 AS "packageRootSha256",
           g.package_bundle_sha256 AS "packageBundleSha256",
           g.package_app_set_sha256 AS "packageAppSetSha256"
    FROM sdk_games g
    JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${creatorSlug} AND g.game_id = ${gameId}
      AND g.deleted_at IS NULL
    LIMIT 1
  `;
  const target = (Array.isArray(targets) ? targets[0] : null) as
    | PromotionTarget
    | null;
  if (!target) {
    throw new GamePackagePromotionError("promotion_target_not_found", 404);
  }
  const source = gamePackagePromotionSource(target);
  if (!source) {
    throw new GamePackagePromotionError("promotion_source_missing", 409);
  }
  assertExpectedGamePackageSource(source, expected);
  const rows = await sdkSql()`
    INSERT INTO sdk_release_decisions (
      lineage_id, public_game_id, route, action,
      source_environment, target_environment, revision,
      package_root_sha256, server_bundle_sha256, app_set_source_sha256,
      reason, actor_ref
    )
    SELECT ${`${creatorSlug}/${gameId}`}, g.public_game_id,
           'sdk-candidate', 'reject', ${input.target}, ${input.target},
           ${source.revision}, ${source.packageRootSha256},
           ${source.bundleSha256}, ${source.appSetSha256},
           ${decision.reason}, ${decision.actorRef}
    FROM sdk_games g
    JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${creatorSlug}
      AND g.game_id = ${gameId}
      AND g.deleted_at IS NULL
      AND g.package_revision = ${source.revision}
      AND g.package_root_sha256 = ${source.packageRootSha256}
      AND g.package_bundle_sha256 = ${source.bundleSha256}
      AND g.package_app_set_sha256 = ${source.appSetSha256}
    RETURNING id AS "decisionId", decided_at AS "decidedAt"
  `;
  const rejected = Array.isArray(rows) ? rows[0] : null;
  if (!rejected) {
    throw new GamePackagePromotionError("promotion_source_changed", 409);
  }
  return {
    rejected: true as const,
    target: input.target,
    creatorSlug,
    gameId,
    revision: source.revision,
    ...(rejected as { decisionId: string; decidedAt: string }),
  };
}
