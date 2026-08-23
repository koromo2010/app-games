import { createGamePackageRuntimeReader } from "@/lib/mock-git-store";
import { sdkSql } from "@/lib/sdk-postgres";
import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import {
  acceptsExactTargetSafeProjectionRequest,
  createYabobojpnLabSafeProjection,
} from "@/lib/creator-exact-target-safe-projection";
import {
  inspectYabobojpnLabArtifacts,
  yabobojpnLabSafeProjectionTarget,
  type ForensicArtifactTarget,
} from "@/lib/creator-deletion-forensics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };
const exactPath = "/api/internal/audit/yabobojpn-lab-safe-projection";

function environment(): "production" | "development" {
  return process.env.VERCEL_GIT_COMMIT_REF === "main" ? "production" : "development";
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function GET(request: Request) {
  try {
    requireSdkServiceRequest(request, { expectedEnvironment: environment() });
  } catch {
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  }
  if (!acceptsExactTargetSafeProjectionRequest(request, exactPath)) {
    return Response.json(
      { error: "EXACT_TARGET_SAFE_PROJECTION_INPUT_INVALID" },
      { status: 400, headers },
    );
  }
  try {
    const sql = sdkSql();
    const [creatorRows, aggregateRows, artifactRows] = await sql.transaction((tx) => [
      tx`
        SELECT owner_player_id AS "ownerPlayerId", deleted_at AS "deletedAt"
        FROM sdk_creators
        WHERE slug = ${yabobojpnLabSafeProjectionTarget}
        LIMIT 1
      `,
      tx`
        SELECT
          COUNT(DISTINCT g.id)::INTEGER AS games,
          COUNT(DISTINCT (r.game_id::TEXT || ':' || r.revision))::INTEGER AS "packageRevisions",
          COUNT(DISTINCT ar.id)::INTEGER AS releases,
          COUNT(DISTINCT ar.id) FILTER (WHERE ar.is_current)::INTEGER AS "currentReleases",
          COUNT(DISTINCT og.id) FILTER (
            WHERE og.revoked_at IS NULL AND og.refresh_expires_at > NOW()
          )::INTEGER AS "activeGrants",
          COUNT(DISTINCT og.id) FILTER (
            WHERE og.revoked_at IS NOT NULL OR og.refresh_expires_at <= NOW()
          )::INTEGER AS "revokedGrants"
        FROM sdk_creators c
        LEFT JOIN sdk_games g ON g.creator_id = c.id
        LEFT JOIN sdk_game_package_revisions r ON r.game_id = g.id
        LEFT JOIN sdk_app_releases ar ON ar.source_creator_slug = c.slug
        LEFT JOIN sdk_oauth_grants og ON og.player_id = c.owner_player_id
        WHERE c.slug = ${yabobojpnLabSafeProjectionTarget}
      `,
      tx`
        SELECT g.game_id AS "gameId", g.mock_revision AS "mockRevision",
               g.package_revision AS "packageRevision", r.revision AS "savedPackageRevision"
        FROM sdk_creators c
        JOIN sdk_games g ON g.creator_id = c.id
        LEFT JOIN sdk_game_package_revisions r ON r.game_id = g.id
        WHERE c.slug = ${yabobojpnLabSafeProjectionTarget}
      `,
    ], { isolationLevel: "RepeatableRead", readOnly: true });
    const creator = (creatorRows as Array<Record<string, unknown>>)[0];
    const aggregate = (aggregateRows as Array<Record<string, unknown>>)[0] ?? {};
    const targets: ForensicArtifactTarget[] = [];
    for (const row of artifactRows as Array<Record<string, unknown>>) {
      const gameId = typeof row.gameId === "string" ? row.gameId : "";
      for (const [kind, field] of [["mock", "mockRevision"], ["package", "packageRevision"], ["package", "savedPackageRevision"]] as const) {
        const revision = row[field];
        if (gameId && typeof revision === "string") targets.push({ kind, gameId, revision });
      }
    }
    const artifactSummary = await inspectYabobojpnLabArtifacts(targets, createGamePackageRuntimeReader());
    return Response.json(createYabobojpnLabSafeProjection({
      environment: environment(),
      observation: "OBSERVED",
      lifecycle: !creator
        ? "missing"
        : creator.deletedAt === null
          ? "active"
          : creator.deletedAt instanceof Date || typeof creator.deletedAt === "string"
            ? "deleted"
            : "ambiguous",
      deletedAt: creator?.deletedAt,
      ownerPlayerId: typeof creator?.ownerPlayerId === "string" ? creator.ownerPlayerId : null,
      secret: process.env.SDK_ACCOUNT_LINK_SECRET ?? "",
      counts: {
        games: number(aggregate.games),
        packageRevisions: number(aggregate.packageRevisions),
        releases: number(aggregate.releases),
        currentReleases: number(aggregate.currentReleases),
        activeGrants: number(aggregate.activeGrants),
        revokedGrants: number(aggregate.revokedGrants),
      },
      artifactSummary,
    }), { headers });
  } catch {
    return Response.json(createYabobojpnLabSafeProjection({
      environment: environment(),
      observation: "UNKNOWN",
      lifecycle: "ambiguous",
      deletedAt: null,
      ownerPlayerId: null,
      secret: "",
      counts: {
        games: 0,
        packageRevisions: 0,
        releases: 0,
        currentReleases: 0,
        activeGrants: 0,
        revokedGrants: 0,
      },
    }), { headers });
  }
}
