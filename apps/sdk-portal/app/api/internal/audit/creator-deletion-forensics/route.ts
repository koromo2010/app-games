import { requireSdkServiceRequest } from "@/lib/sdk-service-auth";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";
import { createGamePackageRuntimeReader } from "@/lib/mock-git-store";
import {
  createCreatorDeletionAggregateProjection,
  createCreatorDeletionTargetProjection,
  creatorDeletionForensicsTarget,
  inspectCreatorArtifacts,
  type ForensicArtifactTarget,
} from "@/lib/creator-deletion-forensics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-store" };

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
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const slug = url.searchParams.get("slug");
  const keys = [...url.searchParams.keys()];
  const targetRequest = mode === "target"
    && slug === creatorDeletionForensicsTarget
    && keys.every((key) => key === "mode" || key === "slug")
    && new Set(keys).size === keys.length;
  const aggregateRequest = mode === "aggregate"
    && slug === null
    && keys.length === 1
    && keys[0] === "mode";
  if (!targetRequest && !aggregateRequest) {
    return Response.json(
      { error: "CREATOR_DELETION_FORENSICS_INPUT_INVALID" },
      { status: 400, headers },
    );
  }
  try {
    await ensureSdkSchema();
    const sql = sdkSql();
    if (aggregateRequest) {
      const [rows] = await sql.transaction((tx) => [tx`
        SELECT
          (SELECT COUNT(*) FROM sdk_creators WHERE deleted_at IS NOT NULL)::INTEGER AS "deletedCreators",
          (SELECT COUNT(*) FROM sdk_creators WHERE deleted_at IS NULL)::INTEGER AS "activeCreators",
          (SELECT COUNT(*) FROM sdk_creators
            WHERE deleted_at IS NOT NULL
              AND EXTRACT(HOUR FROM deleted_at AT TIME ZONE 'UTC') = 0
              AND EXTRACT(MINUTE FROM deleted_at AT TIME ZONE 'UTC') = 43
          )::INTEGER AS "legacyCronMinuteCreators",
          (SELECT COUNT(DISTINCT c.id) FROM sdk_creators c
            JOIN sdk_games g ON g.creator_id = c.id
            WHERE c.deleted_at IS NOT NULL
          )::INTEGER AS "deletedCreatorsWithGameRows",
          (SELECT COUNT(*) FROM sdk_games g
            JOIN sdk_creators c ON c.id = g.creator_id
            WHERE c.deleted_at IS NOT NULL
          )::INTEGER AS "gameRowsForDeletedCreators",
          (SELECT COUNT(*) FROM sdk_game_package_revisions r
            JOIN sdk_games g ON g.id = r.game_id
            JOIN sdk_creators c ON c.id = g.creator_id
            WHERE c.deleted_at IS NOT NULL
          )::INTEGER AS "packageRevisionRowsForDeletedCreators",
          (SELECT COUNT(*) FROM sdk_app_releases r
            JOIN sdk_creators c ON c.slug = r.source_creator_slug
            WHERE c.deleted_at IS NOT NULL
          )::INTEGER AS "releaseRowsForDeletedCreators",
          (SELECT MIN(deleted_at) FROM sdk_creators WHERE deleted_at IS NOT NULL) AS "earliestDeletedAt",
          (SELECT MAX(deleted_at) FROM sdk_creators WHERE deleted_at IS NOT NULL) AS "latestDeletedAt"
      `], { isolationLevel: "RepeatableRead", readOnly: true });
      const row = (rows as Array<Record<string, unknown>>)[0] ?? {};
      return Response.json(createCreatorDeletionAggregateProjection({
        environment: environment(),
        counts: {
          deletedCreators: number(row.deletedCreators),
          activeCreators: number(row.activeCreators),
          legacyCronMinuteCreators: number(row.legacyCronMinuteCreators),
          deletedCreatorsWithGameRows: number(row.deletedCreatorsWithGameRows),
          gameRowsForDeletedCreators: number(row.gameRowsForDeletedCreators),
          packageRevisionRowsForDeletedCreators: number(row.packageRevisionRowsForDeletedCreators),
          releaseRowsForDeletedCreators: number(row.releaseRowsForDeletedCreators),
        },
        earliestDeletedAt: row.earliestDeletedAt,
        latestDeletedAt: row.latestDeletedAt,
      }), { headers });
    }

    const [creatorRows, assetRows, artifactRows] = await sql.transaction((tx) => [
      tx`
        SELECT
          deleted_at IS NOT NULL AS "isDeleted",
          owner_player_id IS NULL AS "ownerIsNull",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM sdk_creators
        WHERE slug = ${creatorDeletionForensicsTarget}
        LIMIT 1
      `,
      tx`
        SELECT
          COUNT(DISTINCT g.id)::INTEGER AS "gameRows",
          COUNT(DISTINCT g.id) FILTER (WHERE g.deleted_at IS NOT NULL)::INTEGER AS "tombstonedGameRows",
          COUNT(DISTINCT g.id) FILTER (WHERE g.deleted_at IS NULL)::INTEGER AS "activeGameRows",
          COUNT(DISTINCT g.id) FILTER (WHERE g.mock_revision IS NOT NULL)::INTEGER AS "gamesWithMockLocator",
          COUNT(DISTINCT g.id) FILTER (WHERE g.package_revision IS NOT NULL)::INTEGER AS "gamesWithPackageLocator",
          COUNT(DISTINCT (r.game_id::TEXT || ':' || r.revision))::INTEGER AS "packageRevisionRows",
          COUNT(DISTINCT h.id)::INTEGER AS "channelHistoryRows",
          COUNT(DISTINCT ar.id)::INTEGER AS "releaseRows",
          COUNT(DISTINCT ar.id) FILTER (WHERE ar.is_current)::INTEGER AS "currentReleaseRows",
          COUNT(DISTINCT d.id)::INTEGER AS "releaseDecisionRows"
        FROM sdk_creators c
        LEFT JOIN sdk_games g ON g.creator_id = c.id
        LEFT JOIN sdk_game_package_revisions r ON r.game_id = g.id
        LEFT JOIN sdk_game_channel_history h ON h.game_id = g.id
        LEFT JOIN sdk_app_releases ar ON ar.source_creator_slug = c.slug
        LEFT JOIN sdk_release_decisions d ON d.lineage_id = c.slug || '/' || g.game_id
        WHERE c.slug = ${creatorDeletionForensicsTarget}
      `,
      tx`
        SELECT g.game_id AS "gameId", g.mock_revision AS "mockRevision",
               g.package_revision AS "packageRevision", r.revision AS "savedPackageRevision"
        FROM sdk_creators c
        JOIN sdk_games g ON g.creator_id = c.id
        LEFT JOIN sdk_game_package_revisions r ON r.game_id = g.id
        WHERE c.slug = ${creatorDeletionForensicsTarget}
      `,
    ], { isolationLevel: "RepeatableRead", readOnly: true });
    const creator = (creatorRows as Array<Record<string, unknown>>)[0];
    const assets = (assetRows as Array<Record<string, unknown>>)[0] ?? {};
    const targets: ForensicArtifactTarget[] = [];
    for (const row of artifactRows as Array<Record<string, unknown>>) {
      const gameId = typeof row.gameId === "string" ? row.gameId : "";
      for (const [kind, field] of [["mock", "mockRevision"], ["package", "packageRevision"], ["package", "savedPackageRevision"]] as const) {
        const revision = row[field];
        if (gameId && typeof revision === "string") targets.push({ kind, gameId, revision });
      }
    }
    const artifactSummary = await inspectCreatorArtifacts(targets, createGamePackageRuntimeReader());
    return Response.json(createCreatorDeletionTargetProjection({
      environment: environment(),
      creator: creator ? {
        lifecycle: creator.isDeleted ? "deleted" : "active",
        ownerIsNull: creator.ownerIsNull === true,
        createdAt: creator.createdAt,
        updatedAt: creator.updatedAt,
        deletedAt: creator.deletedAt,
      } : {
        lifecycle: "missing",
        ownerIsNull: true,
        createdAt: null,
        updatedAt: null,
        deletedAt: null,
      },
      assets: {
        gameRows: number(assets.gameRows),
        tombstonedGameRows: number(assets.tombstonedGameRows),
        activeGameRows: number(assets.activeGameRows),
        gamesWithMockLocator: number(assets.gamesWithMockLocator),
        gamesWithPackageLocator: number(assets.gamesWithPackageLocator),
        packageRevisionRows: number(assets.packageRevisionRows),
        channelHistoryRows: number(assets.channelHistoryRows),
        releaseRows: number(assets.releaseRows),
        currentReleaseRows: number(assets.currentReleaseRows),
        releaseDecisionRows: number(assets.releaseDecisionRows),
      },
      artifactSummary,
    }), { headers });
  } catch {
    return Response.json(
      { error: "CREATOR_DELETION_FORENSICS_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
