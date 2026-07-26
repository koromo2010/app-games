import {
  GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
} from "@game-fields/game-sdk/portable-server";
import { createPackageRuntimeAccess } from "./preview-links";
import {
  assertExpectedGamePackageSource,
  gamePackagePromotionSource,
  GamePackagePromotionError,
  type ExpectedGamePackageSource,
  type GamePackagePromotionTarget,
} from "./game-package-promotion";
import { jsonValuesEqual } from "./canonical-json";
import { ensureSdkSchema, sdkSql } from "./sdk-postgres";

const IDENTIFIER_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type PromoteGamePackageInput = {
  creatorSlug: string;
  gameId: string;
  publicGameId: string;
  target: "development" | "main";
  expectedSource?: ExpectedGamePackageSource;
};

type PromotionTarget = GamePackagePromotionTarget & {
  creatorSlug: string;
  gameId: string;
};

function normalizedInput(input: PromoteGamePackageInput) {
  const creatorSlug = input.creatorSlug.trim().toLowerCase();
  const gameId = input.gameId.trim().toLowerCase();
  const publicGameId = input.publicGameId.trim().toLowerCase();
  if (
    !IDENTIFIER_PATTERN.test(creatorSlug)
    || !IDENTIFIER_PATTERN.test(gameId)
    || !IDENTIFIER_PATTERN.test(publicGameId)
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
  return { creatorSlug, gameId, publicGameId, expected };
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

export async function promoteGamePackage(input: PromoteGamePackageInput) {
  const {
    creatorSlug,
    gameId,
    publicGameId,
    expected,
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
  const {
    revision,
    packageRootSha256,
    bundleSha256,
    appSetSha256,
    manifest,
  } = source;
  await verifyPortableManifest({
    creatorSlug,
    gameId,
    revision,
    bundleSha256,
    manifest,
  });
  const manifestJson = JSON.stringify(manifest);
  const rows = await sdkSql()`
    UPDATE sdk_games g
    SET public_game_id = ${publicGameId},
        stable_revision = ${revision},
        stable_root_sha256 = ${packageRootSha256},
        stable_bundle_sha256 = ${bundleSha256},
        stable_app_set_sha256 = ${appSetSha256},
        stable_manifest = ${manifestJson}::jsonb,
        status = 'stable',
        updated_at = NOW()
    FROM sdk_creators c
    WHERE g.creator_id = c.id
      AND c.slug = ${creatorSlug}
      AND g.game_id = ${gameId}
      AND g.package_revision = ${revision}
      AND g.package_root_sha256 = ${packageRootSha256}
      AND g.package_bundle_sha256 = ${bundleSha256}
      AND g.package_app_set_sha256 = ${appSetSha256}
    RETURNING g.public_game_id AS "publicGameId",
              g.stable_revision AS revision,
              g.stable_root_sha256 AS "packageRootSha256",
              g.stable_bundle_sha256 AS "serverBundleSha256",
              g.stable_app_set_sha256 AS "appSetSourceSha256"
  `;
  const promoted = Array.isArray(rows) ? rows[0] : null;
  if (!promoted) {
    throw new GamePackagePromotionError("promotion_source_changed", 409);
  }
  const promotedRecord = promoted as {
    revision: string;
    packageRootSha256: string;
  };
  await sdkSql()`
    INSERT INTO sdk_game_channel_history (
      game_id, channel, revision, package_root_sha256
    )
    SELECT g.id, 'stable', ${promotedRecord.revision},
           ${promotedRecord.packageRootSha256}
    FROM sdk_games g
    JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${creatorSlug} AND g.game_id = ${gameId}
    ON CONFLICT (game_id, channel, revision) DO NOTHING
  `;
  await sdkSql().transaction([
    sdkSql()`UPDATE sdk_app_releases
             SET is_current = FALSE
             WHERE lineage_id = ${`${creatorSlug}/${gameId}`} AND is_current`,
    sdkSql()`INSERT INTO sdk_app_releases (
      lineage_id, public_game_id, source_creator_slug, source_game_id,
      title, description, revision, package_root_sha256, server_bundle_sha256,
      app_set_source_sha256, manifest, module_policy, source_environment,
      release_kind
    )
    SELECT ${`${creatorSlug}/${gameId}`}, ${publicGameId}, c.slug, g.game_id,
           g.title, g.description, ${revision}, ${packageRootSha256},
           ${bundleSha256}, ${appSetSha256}, ${manifestJson}::jsonb,
           g.module_policy, ${input.target}, 'promotion'
    FROM sdk_games g JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${creatorSlug} AND g.game_id = ${gameId}`,
  ]);
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
    }),
  };
}

export function promotionErrorResponse(error: unknown) {
  if (error instanceof GamePackagePromotionError) {
    return Response.json({ error: error.code }, { status: error.status });
  }
  const code = error instanceof Error ? error.message : "";
  if (/unique/i.test(code)) {
    return Response.json({ error: "public_game_id_conflict" }, { status: 409 });
  }
  return Response.json({ error: "promotion_failed" }, { status: 503 });
}
