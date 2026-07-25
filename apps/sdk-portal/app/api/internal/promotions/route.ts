import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";
import {
  promoteGamePackage,
  promotionErrorResponse,
} from "@/lib/game-package-promotion-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GAME_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

function authorize(request: Request) {
  try {
    requireSdkServiceRequest(request);
    return null;
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT c.slug AS "creatorSlug", g.game_id AS "gameId",
           g.title, g.status, g.public_game_id AS "publicGameId",
           g.package_revision AS "packageRevision",
           g.package_root_sha256 AS "packageRootSha256",
           g.package_bundle_sha256 AS "packageBundleSha256",
           g.package_app_set_sha256 AS "packageAppSetSha256",
           g.development_revision AS "developmentRevision",
           g.development_root_sha256 AS "developmentRootSha256",
           g.development_bundle_sha256 AS "developmentBundleSha256",
           g.development_app_set_sha256 AS "developmentAppSetSha256",
           g.stable_revision AS "stableRevision",
           g.stable_root_sha256 AS "stableRootSha256",
           g.stable_bundle_sha256 AS "stableBundleSha256",
           g.stable_app_set_sha256 AS "stableAppSetSha256",
           g.updated_at AS "updatedAt"
    FROM sdk_games g
    JOIN sdk_creators c ON c.id = g.creator_id
    WHERE g.package_revision IS NOT NULL
      AND g.deleted_at IS NULL
    ORDER BY g.updated_at DESC
    LIMIT 100
  `;
  return Response.json({ games: rows }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as {
    creatorSlug?: unknown;
    gameId?: unknown;
    publicGameId?: unknown;
    channel?: unknown;
  } | null;
  const creatorSlug = typeof body?.creatorSlug === "string"
    ? body.creatorSlug.trim().toLowerCase()
    : "";
  const gameId = typeof body?.gameId === "string"
    ? body.gameId.trim().toLowerCase()
    : "";
  const publicGameId = typeof body?.publicGameId === "string"
    ? body.publicGameId.trim().toLowerCase()
    : "";
  const channel = body?.channel;
  if (
    !GAME_PATTERN.test(gameId)
    || !GAME_PATTERN.test(publicGameId)
    || (channel !== "development" && channel !== "stable")
  ) {
    return Response.json({ error: "promotion_input_invalid" }, { status: 400 });
  }

  try {
    return Response.json(await promoteGamePackage({
      creatorSlug,
      gameId,
      publicGameId,
      channel,
    }));
  } catch (error) {
    return promotionErrorResponse(error);
  }
}

/**
 * Remove a mutable channel pointer without deleting the immutable package
 * revision or its append-only promotion history. Existing Rooms continue from
 * the contract pinned when they were created; only new catalog resolution is
 * stopped.
 */
export async function DELETE(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null) as {
    creatorSlug?: unknown;
    gameId?: unknown;
    channel?: unknown;
  } | null;
  const creatorSlug = typeof body?.creatorSlug === "string"
    ? body.creatorSlug.trim().toLowerCase()
    : "";
  const gameId = typeof body?.gameId === "string"
    ? body.gameId.trim().toLowerCase()
    : "";
  const channel = body?.channel;
  if (
    !GAME_PATTERN.test(creatorSlug)
    || !GAME_PATTERN.test(gameId)
    || (channel !== "development" && channel !== "stable")
  ) {
    return Response.json({ error: "promotion_input_invalid" }, { status: 400 });
  }

  try {
    await ensureSdkSchema();
    const rows = channel === "development"
      ? await sdkSql()`
          UPDATE sdk_games g
          SET development_revision = NULL,
              development_root_sha256 = NULL,
              development_bundle_sha256 = NULL,
              development_app_set_sha256 = NULL,
              development_manifest = NULL,
              status = CASE
                WHEN stable_revision IS NOT NULL THEN 'stable'
                ELSE 'submitted'
              END,
              updated_at = NOW()
          FROM sdk_creators c
          WHERE g.creator_id = c.id
            AND c.slug = ${creatorSlug}
            AND g.game_id = ${gameId}
            AND g.deleted_at IS NULL
          RETURNING g.game_id AS "gameId"
        `
      : await sdkSql()`
          UPDATE sdk_games g
          SET stable_revision = NULL,
              stable_root_sha256 = NULL,
              stable_bundle_sha256 = NULL,
              stable_app_set_sha256 = NULL,
              stable_manifest = NULL,
              status = CASE
                WHEN development_revision IS NOT NULL THEN 'development'
                ELSE 'submitted'
              END,
              updated_at = NOW()
          FROM sdk_creators c
          WHERE g.creator_id = c.id
            AND c.slug = ${creatorSlug}
            AND g.game_id = ${gameId}
            AND g.deleted_at IS NULL
          RETURNING g.game_id AS "gameId"
        `;
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: "promotion_target_not_found" }, { status: 404 });
    }
    return Response.json({
      unpublished: true,
      creatorSlug,
      gameId,
      channel,
    });
  } catch {
    return Response.json({ error: "unpublish_failed" }, { status: 503 });
  }
}
