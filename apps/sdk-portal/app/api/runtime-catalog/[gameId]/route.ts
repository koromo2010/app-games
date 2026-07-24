import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { createPackageRuntimeAccess } from "@/lib/preview-links";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  try {
    requireSdkServiceRequest(request);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const { gameId } = await context.params;
  const channel = new URL(request.url).searchParams.get("channel");
  if (channel !== "development" && channel !== "stable") {
    return Response.json({ error: "channel_required" }, { status: 400 });
  }
  await ensureSdkSchema();
  const rows = channel === "development"
    ? await sdkSql()`
        SELECT c.slug AS "creatorSlug", g.game_id AS "sourceGameId",
               g.public_game_id AS "gameId", g.title,
               g.development_revision AS revision,
               g.development_bundle_sha256 AS "serverBundleSha256",
               g.development_app_set_sha256 AS "appSetSourceSha256",
               g.development_manifest AS manifest
        FROM sdk_games g
        JOIN sdk_creators c ON c.id = g.creator_id
        WHERE g.public_game_id = ${gameId}
          AND g.development_revision IS NOT NULL
        LIMIT 1
      `
    : await sdkSql()`
        SELECT c.slug AS "creatorSlug", g.game_id AS "sourceGameId",
               g.public_game_id AS "gameId", g.title,
               g.stable_revision AS revision,
               g.stable_bundle_sha256 AS "serverBundleSha256",
               g.stable_app_set_sha256 AS "appSetSourceSha256",
               g.stable_manifest AS manifest
        FROM sdk_games g
        JOIN sdk_creators c ON c.id = g.creator_id
        WHERE g.public_game_id = ${gameId}
          AND g.stable_revision IS NOT NULL
        LIMIT 1
      `;
  const game = Array.isArray(rows) ? rows[0] as {
    creatorSlug: string;
    sourceGameId: string;
    gameId: string;
    title: string;
    revision: string;
    serverBundleSha256: string;
    appSetSourceSha256: string;
    manifest: unknown;
  } | undefined : undefined;
  if (!game) return Response.json({ error: "not_found" }, { status: 404 });
  const access = createPackageRuntimeAccess({
    instanceId: game.creatorSlug,
    gameId: game.sourceGameId,
    revision: game.revision,
    serverBundleSha256: game.serverBundleSha256,
  });
  return Response.json({
    ...game,
    channel,
    clientRuntimeUrl: access.clientRuntimeUrl,
    serverRuntimeUrl: access.serverRuntimeUrl,
    serverRuntimeToken: access.serverRuntimeToken,
    serverRuntimeExpiresAt: access.expiresAt,
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
