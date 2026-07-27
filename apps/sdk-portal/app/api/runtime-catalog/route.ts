import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";

export const dynamic = "force-dynamic";

function expectedChannel() {
  return process.env.VERCEL_GIT_COMMIT_REF === "main"
    ? "main" as const
    : "development" as const;
}

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request);
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const channel = new URL(request.url).searchParams.get("channel");
  if (channel !== expectedChannel()) {
    return Response.json({ error: "channel_required" }, { status: 400 });
  }
  await ensureSdkSchema();
  const games = await sdkSql()`
    SELECT r.public_game_id AS id,
           r.lineage_id AS "lineageId",
           r.source_creator_slug AS "sourceCreatorSlug",
           r.source_game_id AS "sourceGameId",
           r.title,
           r.description,
           r.revision,
           r.source_revision AS "sourceRevision",
           r.package_root_sha256 AS "packageRootSha256",
           r.server_bundle_sha256 AS "serverBundleSha256",
           r.app_set_source_sha256 AS "appSetSourceSha256",
           r.manifest,
           r.module_policy AS "modulePolicy",
           r.released_at AS "releasedAt"
    FROM sdk_app_releases r
    WHERE r.is_current
    ORDER BY r.released_at DESC
    LIMIT 100
  `;
  return Response.json({ channel, games }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
