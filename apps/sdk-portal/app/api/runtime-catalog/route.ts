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
  if (channel !== "main") {
    return Response.json({ error: "channel_required" }, { status: 400 });
  }
  await ensureSdkSchema();
  const games = await sdkSql()`
    SELECT g.public_game_id AS id, g.description,
           g.stable_revision AS revision,
           g.stable_root_sha256 AS "packageRootSha256",
           g.stable_bundle_sha256 AS "serverBundleSha256",
           g.stable_app_set_sha256 AS "appSetSourceSha256",
           g.stable_manifest AS manifest
    FROM sdk_games g
    WHERE g.public_game_id IS NOT NULL
      AND g.deleted_at IS NULL
      AND g.stable_revision IS NOT NULL
      AND g.stable_manifest IS NOT NULL
    ORDER BY g.updated_at DESC
    LIMIT 100
  `;
  return Response.json({ channel, games }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
