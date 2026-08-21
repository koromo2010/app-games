import { requireSdkServiceRequest, sdkServiceHeaders } from "@/lib/sdk-service-auth";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";
import { createCreatorOwnershipDiagnostic } from "@/lib/creator-ownership-diagnostic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const slugPattern = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

function environment(): "production" | "development" {
  return process.env.VERCEL_GIT_COMMIT_REF === "main"
    ? "production"
    : "development";
}

async function principalValidity(ownerPlayerId: string) {
  const base = process.env.GAME_FIELDS_APP_BASE_URL?.replace(/\/$/, "")
    ?? (environment() === "production"
      ? "https://www.game-fields.com"
      : "https://dev.game-fields.com");
  const url = `${base}/api/internal/sdk-owner-principal`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...sdkServiceHeaders("POST", url, { environment: environment() }),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ playerId: ownerPlayerId }),
    cache: "no-store",
  });
  if (!response.ok) return "unknown" as const;
  const payload = await response.json().catch(() => null) as {
    principalValidity?: unknown;
  } | null;
  return payload?.principalValidity === "active"
    || payload?.principalValidity === "missing"
    ? payload.principalValidity
    : "unknown";
}

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: environment() });
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug")?.trim().toLowerCase() ?? "";
  if (
    !slugPattern.test(slug)
    || [...url.searchParams.keys()].some((key) => key !== "slug")
  ) {
    return Response.json(
      { error: "CREATOR_OWNERSHIP_DIAGNOSTIC_INPUT_INVALID" },
      { status: 400, headers },
    );
  }
  try {
    await ensureSdkSchema();
    const sql = sdkSql();
    const [creatorRows, assetRows] = await sql.transaction((tx) => [
      tx`
        SELECT id, owner_player_id AS "ownerPlayerId", deleted_at AS "deletedAt"
        FROM sdk_creators
        WHERE slug = ${slug}
        LIMIT 1
      `,
      tx`
        SELECT
          COUNT(DISTINCT g.id)::INTEGER AS games,
          COUNT(DISTINCT g.id) FILTER (WHERE g.status = 'draft')::INTEGER AS drafts,
          COUNT(DISTINCT g.id) FILTER (WHERE g.mock_revision IS NOT NULL)::INTEGER AS "prototypeRevisions",
          COUNT(DISTINCT (r.game_id::TEXT || ':' || r.revision))::INTEGER AS "packageRevisions",
          COUNT(DISTINCT ar.id) FILTER (WHERE ar.is_current)::INTEGER AS "currentReleases"
        FROM sdk_creators c
        LEFT JOIN sdk_games g ON g.creator_id = c.id AND g.deleted_at IS NULL
        LEFT JOIN sdk_game_package_revisions r ON r.game_id = g.id
        LEFT JOIN sdk_app_releases ar ON ar.source_creator_slug = c.slug
        WHERE c.slug = ${slug}
      `,
    ], { isolationLevel: "RepeatableRead", readOnly: true });
    const creator = (creatorRows as Array<{
      id: string;
      ownerPlayerId: string | null;
      deletedAt: string | null;
    }>)[0];
    if (!creator) {
      return Response.json(createCreatorOwnershipDiagnostic({
        slug,
        lifecycle: "missing",
        ownerPlayerId: null,
        principalValidity: "unknown",
        counts: { games: 0, drafts: 0, prototypeRevisions: 0, packageRevisions: 0, currentReleases: 0, activeGrants: 0, revokedGrants: 0 },
        environment: environment(),
        secret: process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
      }), { headers });
    }
    const ownerPlayerId = creator.ownerPlayerId;
    const grantRows = ownerPlayerId
      ? await sql`
          SELECT
            COUNT(*) FILTER (WHERE revoked_at IS NULL AND refresh_expires_at > NOW())::INTEGER AS active,
            COUNT(*) FILTER (WHERE revoked_at IS NOT NULL OR refresh_expires_at <= NOW())::INTEGER AS revoked
          FROM sdk_oauth_grants
          WHERE player_id = ${ownerPlayerId}
        `
      : [{ active: 0, revoked: 0 }];
    const assets = (assetRows as Array<Record<string, unknown>>)[0] ?? {};
    const grants = (grantRows as Array<Record<string, unknown>>)[0] ?? {};
    return Response.json(createCreatorOwnershipDiagnostic({
      slug,
      lifecycle: creator.deletedAt ? "deleted" : "active",
      ownerPlayerId,
      principalValidity: ownerPlayerId
        ? await principalValidity(ownerPlayerId)
        : "unknown",
      counts: {
        games: Number(assets.games ?? 0),
        drafts: Number(assets.drafts ?? 0),
        prototypeRevisions: Number(assets.prototypeRevisions ?? 0),
        packageRevisions: Number(assets.packageRevisions ?? 0),
        currentReleases: Number(assets.currentReleases ?? 0),
        activeGrants: Number(grants.active ?? 0),
        revokedGrants: Number(grants.revoked ?? 0),
      },
      environment: environment(),
      secret: process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
    }), { headers });
  } catch {
    return Response.json(
      { error: "CREATOR_OWNERSHIP_DIAGNOSTIC_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
