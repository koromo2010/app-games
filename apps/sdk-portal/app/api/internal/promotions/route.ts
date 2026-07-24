import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { createPackageRuntimeAccess } from "@/lib/preview-links";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";
import {
  GAME_SDK_PORTABLE_SERVER_PROTOCOL_VERSION,
} from "@game-fields/game-sdk/portable-server";
import {
  gamePackagePromotionSource,
  type GamePackagePromotionTarget,
} from "@/lib/game-package-promotion";

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
           g.package_bundle_sha256 AS "packageBundleSha256",
           g.package_app_set_sha256 AS "packageAppSetSha256",
           g.development_revision AS "developmentRevision",
           g.development_bundle_sha256 AS "developmentBundleSha256",
           g.development_app_set_sha256 AS "developmentAppSetSha256",
           g.stable_revision AS "stableRevision",
           g.stable_bundle_sha256 AS "stableBundleSha256",
           g.stable_app_set_sha256 AS "stableAppSetSha256",
           g.updated_at AS "updatedAt"
    FROM sdk_games g
    JOIN sdk_creators c ON c.id = g.creator_id
    WHERE g.package_revision IS NOT NULL
    ORDER BY g.updated_at DESC
    LIMIT 100
  `;
  return Response.json({ games: rows }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

type PromotionTarget = GamePackagePromotionTarget & {
  creatorSlug: string;
  gameId: string;
};

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
    || JSON.stringify(payload.value) !== JSON.stringify(target.manifest)
  ) {
    throw new Error("GAME_SDK_PACKAGE_RUNTIME_MANIFEST_MISMATCH");
  }
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
    await ensureSdkSchema();
    const targets = await sdkSql()`
      SELECT c.slug AS "creatorSlug", g.game_id AS "gameId", g.manifest,
             g.package_revision AS "packageRevision",
             g.package_bundle_sha256 AS "packageBundleSha256",
             g.package_app_set_sha256 AS "packageAppSetSha256",
             g.development_revision AS "developmentRevision",
             g.development_bundle_sha256 AS "developmentBundleSha256",
             g.development_app_set_sha256 AS "developmentAppSetSha256",
             g.development_manifest AS "developmentManifest"
      FROM sdk_games g
      JOIN sdk_creators c ON c.id = g.creator_id
      WHERE c.slug = ${creatorSlug} AND g.game_id = ${gameId}
      LIMIT 1
    `;
    const target = (Array.isArray(targets) ? targets[0] : null) as
      | PromotionTarget
      | null;
    if (!target) {
      return Response.json({ error: "promotion_target_not_found" }, { status: 404 });
    }
    const source = gamePackagePromotionSource(target, channel);
    if (!source) {
      return Response.json({ error: "promotion_source_missing" }, { status: 409 });
    }
    const {
      revision,
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
    const rows = channel === "development"
      ? await sdkSql()`
          UPDATE sdk_games g
          SET public_game_id = ${publicGameId},
              development_revision = ${revision},
              development_bundle_sha256 = ${bundleSha256},
              development_app_set_sha256 = ${appSetSha256},
              development_manifest = ${manifestJson}::jsonb,
              status = 'development',
              updated_at = NOW()
          FROM sdk_creators c
          WHERE g.creator_id = c.id
            AND c.slug = ${creatorSlug}
            AND g.game_id = ${gameId}
            AND g.package_revision = ${revision}
            AND g.package_bundle_sha256 = ${bundleSha256}
            AND g.package_app_set_sha256 = ${appSetSha256}
          RETURNING g.public_game_id AS "publicGameId",
                    g.development_revision AS revision,
                    g.development_bundle_sha256 AS "serverBundleSha256",
                    g.development_app_set_sha256 AS "appSetSourceSha256"
        `
      : await sdkSql()`
          UPDATE sdk_games g
          SET public_game_id = ${publicGameId},
              stable_revision = ${revision},
              stable_bundle_sha256 = ${bundleSha256},
              stable_app_set_sha256 = ${appSetSha256},
              stable_manifest = ${manifestJson}::jsonb,
              status = 'stable',
              updated_at = NOW()
          FROM sdk_creators c
          WHERE g.creator_id = c.id
            AND c.slug = ${creatorSlug}
            AND g.game_id = ${gameId}
            AND g.development_revision = ${revision}
            AND g.development_bundle_sha256 = ${bundleSha256}
            AND g.development_app_set_sha256 = ${appSetSha256}
          RETURNING g.public_game_id AS "publicGameId",
                    g.stable_revision AS revision,
                    g.stable_bundle_sha256 AS "serverBundleSha256",
                    g.stable_app_set_sha256 AS "appSetSourceSha256"
        `;
    const promoted = Array.isArray(rows) ? rows[0] : null;
    if (!promoted) {
      return Response.json({ error: "promotion_source_changed" }, { status: 409 });
    }
    return Response.json({
      promoted: true,
      channel,
      creatorSlug,
      gameId,
      ...promoted,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "GAME_SDK_PACKAGE_RUNTIME_MANIFEST_MISMATCH") {
      return Response.json({ error: code }, { status: 422 });
    }
    if (/unique/i.test(code)) {
      return Response.json({ error: "public_game_id_conflict" }, { status: 409 });
    }
    return Response.json({ error: "promotion_failed" }, { status: 503 });
  }
}
