import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const channel = new URL(request.url).searchParams.get("channel");
  if (channel !== "development" && channel !== "stable") {
    return Response.json({ error: "channel_required" }, { status: 400 });
  }
  await ensureSdkSchema();
  const games = channel === "development"
    ? await sdkSql()`
        SELECT g.public_game_id AS id, g.description,
               g.development_revision AS revision,
               g.development_bundle_sha256 AS "serverBundleSha256",
               g.development_app_set_sha256 AS "appSetSourceSha256",
               g.development_manifest AS manifest
        FROM sdk_games g
        WHERE g.public_game_id IS NOT NULL
          AND g.development_revision IS NOT NULL
          AND g.development_manifest IS NOT NULL
        ORDER BY g.updated_at DESC
        LIMIT 100
      `
    : await sdkSql()`
        SELECT g.public_game_id AS id, g.description,
               g.stable_revision AS revision,
               g.stable_bundle_sha256 AS "serverBundleSha256",
               g.stable_app_set_sha256 AS "appSetSourceSha256",
               g.stable_manifest AS manifest
        FROM sdk_games g
        WHERE g.public_game_id IS NOT NULL
          AND g.stable_revision IS NOT NULL
          AND g.stable_manifest IS NOT NULL
        ORDER BY g.updated_at DESC
        LIMIT 100
      `;
  return Response.json({ channel, games }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
