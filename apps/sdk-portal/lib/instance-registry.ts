import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  sdkInstanceRegistryKey,
  sdkInstanceRegistryReadKeys,
} from "@/lib/instance-registry-namespace";
import { sdkInstanceRegistryCommand as command } from "@/lib/instance-registry-client";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";
import { portalBaseUrl } from "@/lib/oauth-store";
import {
  classifyCreatorOwner,
  type CreatorOwnerRecord,
  type SdkOwnerResolution,
} from "@/lib/sdk-owner-classification";
import {
  logSdkOwnerLookupFailure,
  logSdkOwnerResult,
  SdkOwnerLookupError,
} from "@/lib/sdk-owner-observability";
import {
  normalizeGameSdkModuleProfile,
  updateGameSdkModuleProfile,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const RESERVED = new Set(["api", "download", "downloads", "foundation", "status", "review", "www", "admin"]);

export function normalizeInstanceSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32).replace(/-+$/g, "");
}

export function validateInstanceSlug(slug: string) {
  if (!SLUG_PATTERN.test(slug)) return "URL名は3〜32文字の小文字英数字とハイフンで指定してください。";
  if (RESERVED.has(slug)) return "このURL名はシステムで使用するため予約できません。";
  return null;
}

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeTokenMatch(value: string, expectedHash: string) {
  const actual = Buffer.from(tokenHash(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function registeredCreator(slug: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`SELECT id, slug, display_name, management_token_hash, owner_player_id, deleted_at FROM sdk_creators WHERE slug = ${slug} LIMIT 1`;
  return (Array.isArray(rows) ? rows[0] : undefined) as
    | { id: string; slug: string; display_name: string; management_token_hash: string; owner_player_id: string | null; deleted_at: string | null }
    | undefined;
}

async function registeredCreatorForOwner(slug: string): Promise<CreatorOwnerRecord | undefined> {
  try {
    await ensureSdkSchema();
  } catch (error) {
    const failure = new SdkOwnerLookupError("schema", error);
    logSdkOwnerLookupFailure(failure);
    throw failure;
  }
  try {
    const rows = await sdkSql()`
      SELECT id, slug, display_name, owner_player_id, deleted_at
      FROM sdk_creators
      WHERE slug = ${slug}
      LIMIT 1
    `;
    return (Array.isArray(rows) ? rows[0] : undefined) as CreatorOwnerRecord | undefined;
  } catch (error) {
    const failure = new SdkOwnerLookupError("lookup", error);
    logSdkOwnerLookupFailure(failure);
    throw failure;
  }
}

export async function instanceSlugAvailable(slug: string) {
  if (await registeredCreator(slug)) return false;
  const response = await command(["EXISTS", ...sdkInstanceRegistryReadKeys(slug)]);
  return Number(response.result) === 0;
}

export async function reserveInstanceSlug(slug: string, displayName: string, ownerPlayerId?: string | null) {
  const reservationToken = randomBytes(24).toString("base64url");
  const value = JSON.stringify({ slug, displayName: displayName.slice(0, 80), status: "reserved", reservationToken, ownerPlayerId: ownerPlayerId ?? null, createdAt: new Date().toISOString() });
  const response = await command(["SET", sdkInstanceRegistryKey(slug), value, "NX", "EX", String(7 * 24 * 60 * 60)]);
  if (response.result !== "OK") return null;
  const baseUrl = portalBaseUrl();
  return { slug, url: `${baseUrl}/${slug}`, reservationToken, expiresInSeconds: 7 * 24 * 60 * 60 };
}

export async function finalizeInstanceSlug(slug: string, reservationToken: string, ownerPlayerId?: string | null) {
  let reservationKey: string | undefined;
  let reservationValue: string | undefined;
  for (const key of sdkInstanceRegistryReadKeys(slug)) {
    const reservation = await command(["GET", key]);
    if (typeof reservation.result === "string") {
      reservationKey = key;
      reservationValue = reservation.result;
      break;
    }
  }
  if (!reservationKey || !reservationValue) return null;
  const value = JSON.parse(reservationValue) as { displayName?: unknown; reservationToken?: unknown; ownerPlayerId?: unknown };
  if (typeof value.reservationToken !== "string" || !safeTokenMatch(reservationToken, tokenHash(value.reservationToken))) return null;
  if (typeof value.ownerPlayerId === "string" && value.ownerPlayerId !== ownerPlayerId) return null;
  await ensureSdkSchema();
  const managementToken = randomBytes(32).toString("base64url");
  const rows = await sdkSql()`
    INSERT INTO sdk_creators (slug, display_name, management_token_hash, owner_player_id)
    VALUES (${slug}, ${typeof value.displayName === "string" ? value.displayName.slice(0, 80) : slug}, ${tokenHash(managementToken)}, ${ownerPlayerId ?? null})
    ON CONFLICT (slug) DO NOTHING
    RETURNING id, slug, display_name
  `;
  const creator = Array.isArray(rows) ? rows[0] : undefined;
  if (!creator) return null;
  await command(["DEL", reservationKey]);
  return { creator, managementToken };
}

export async function authenticateCreator(slug: string, managementToken: string) {
  const creator = await registeredCreator(slug);
  if (
    !creator
    || creator.deleted_at
    || !safeTokenMatch(managementToken, creator.management_token_hash)
  ) return null;
  return creator;
}

export async function authenticateCreatorOwner(slug: string, playerId: string) {
  const result = await resolveCreatorOwner(slug, playerId);
  return result.status === "authorized" ? result.creator : null;
}

export async function resolveCreatorOwner(
  slug: string,
  playerId: string,
  dependencies?: {
    lookupCreator?: (slug: string) => Promise<CreatorOwnerRecord | undefined>;
    reportResult?: (status: SdkOwnerResolution["status"]) => void;
  },
): Promise<SdkOwnerResolution> {
  const creator = dependencies?.lookupCreator
    ? await dependencies.lookupCreator(slug)
    : await registeredCreatorForOwner(slug);
  const result = classifyCreatorOwner(creator, playerId);
  if (result.status !== "authorized") {
    (dependencies?.reportResult ?? logSdkOwnerResult)(result.status);
  }
  return result;
}

export async function listCreatorEnvironments(ownerPlayerId: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT c.slug, c.display_name AS "displayName", COUNT(g.id)::int AS "gameCount"
    FROM sdk_creators c
    LEFT JOIN sdk_games g ON g.creator_id = c.id AND g.deleted_at IS NULL
    WHERE c.owner_player_id = ${ownerPlayerId}
      AND c.deleted_at IS NULL
    GROUP BY c.id, c.slug, c.display_name, c.created_at
    ORDER BY c.created_at ASC
  `;
  return rows as Array<{ slug: string; displayName: string; gameCount: number }>;
}

export async function listAccountGames(ownerPlayerId: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT c.slug AS "creatorSlug",
           c.display_name AS "creatorDisplayName",
           g.game_id AS "gameId",
           g.title,
           g.description,
           g.status,
           g.updated_at AS "updatedAt",
           (g.mock_revision IS NOT NULL) AS "mockAvailable",
           (g.package_revision IS NOT NULL) AS "packageAvailable",
           candidate.revision AS "packageCandidateRevision",
           candidate.revision IS DISTINCT FROM g.package_revision AS "packageCandidateAvailable",
           (g.development_revision IS NOT NULL) AS "developmentAvailable",
           (g.stable_revision IS NOT NULL) AS "stableAvailable",
           g.public_game_id AS "publicGameId"
    FROM sdk_games g
    JOIN sdk_creators c ON c.id = g.creator_id
    LEFT JOIN LATERAL (
      SELECT revision
      FROM sdk_game_package_revisions
      WHERE game_id = g.id
      ORDER BY created_at DESC
      LIMIT 1
    ) candidate ON TRUE
    WHERE c.owner_player_id = ${ownerPlayerId}
      AND c.deleted_at IS NULL
      AND g.deleted_at IS NULL
    ORDER BY g.updated_at DESC, g.created_at DESC
  `;
  return rows as Array<{
    creatorSlug: string;
    creatorDisplayName: string;
    gameId: string;
    title: string;
    description: string;
    status: string;
    updatedAt: string;
    mockAvailable: boolean;
    packageAvailable: boolean;
    packageCandidateRevision: string | null;
    packageCandidateAvailable: boolean;
    developmentAvailable: boolean;
    stableAvailable: boolean;
    publicGameId: string | null;
  }>;
}

export async function listCreatorGames(slug: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT g.game_id AS "gameId", g.title, g.description, g.status,
           g.module_policy AS "modulePolicy",
           (g.mock_revision IS NOT NULL) AS "mockAvailable",
           candidate.revision AS "packageCandidateRevision"
    FROM sdk_games g JOIN sdk_creators c ON c.id = g.creator_id
    LEFT JOIN LATERAL (
      SELECT revision
      FROM sdk_game_package_revisions
      WHERE game_id = g.id
      ORDER BY created_at DESC, revision DESC
      LIMIT 1
    ) candidate ON TRUE
    WHERE c.slug = ${slug}
      AND c.deleted_at IS NULL
      AND g.deleted_at IS NULL
    ORDER BY g.updated_at DESC
  `;
  return (rows as Array<{
    gameId: string;
    title: string;
    description: string;
    status: string;
    modulePolicy: unknown;
    mockAvailable: boolean;
    packageCandidateRevision: string | null;
  }>).map((game) => ({
    ...game,
    modulePolicy: normalizeGameSdkModuleProfile(game.modulePolicy),
  }));
}

export async function getCreatorGamePreview(slug: string, gameId: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT g.game_id AS "gameId", g.title, g.manifest,
           g.mock_revision AS "mockRevision",
           g.package_revision AS "packageRevision",
           g.package_root_sha256 AS "packageRootSha256",
           g.package_bundle_sha256 AS "packageBundleSha256",
           g.package_app_set_sha256 AS "packageAppSetSha256",
           g.module_policy AS "modulePolicy"
    FROM sdk_games g JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${slug} AND g.game_id = ${gameId}
      AND g.deleted_at IS NULL
      AND g.deleted_at IS NULL
      AND (g.mock_revision IS NOT NULL OR g.package_revision IS NOT NULL)
    LIMIT 1
  `;
  return (Array.isArray(rows) ? rows[0] : undefined) as
    | {
        gameId: string;
        title: string;
        manifest: unknown;
        mockRevision: string | null;
        packageRevision: string | null;
        packageRootSha256: string | null;
        packageBundleSha256: string | null;
        packageAppSetSha256: string | null;
        modulePolicy: unknown;
      }
    | undefined;
}

export async function getCreatorGamePackageRevision(
  slug: string,
  gameId: string,
  revision?: string,
) {
  await ensureSdkSchema();
  const rows = revision
    ? await sdkSql()`
      SELECT g.game_id AS "gameId", g.title, r.manifest,
             NULL::CHAR(40) AS "mockRevision",
             r.revision AS "packageRevision",
             r.package_root_sha256 AS "packageRootSha256",
             r.server_bundle_sha256 AS "packageBundleSha256",
             r.app_set_source_sha256 AS "packageAppSetSha256",
             g.module_policy AS "modulePolicy"
      FROM sdk_games g
      JOIN sdk_creators c ON c.id = g.creator_id
      JOIN sdk_game_package_revisions r ON r.game_id = g.id
      WHERE c.slug = ${slug}
        AND c.deleted_at IS NULL
        AND g.game_id = ${gameId}
        AND g.deleted_at IS NULL
        AND r.revision = ${revision}
      LIMIT 1
    `
    : await sdkSql()`
      SELECT g.game_id AS "gameId", g.title, r.manifest,
             NULL::CHAR(40) AS "mockRevision",
             r.revision AS "packageRevision",
             r.package_root_sha256 AS "packageRootSha256",
             r.server_bundle_sha256 AS "packageBundleSha256",
             r.app_set_source_sha256 AS "packageAppSetSha256",
             g.module_policy AS "modulePolicy"
      FROM sdk_games g
      JOIN sdk_creators c ON c.id = g.creator_id
      JOIN sdk_game_package_revisions r ON r.game_id = g.id
      WHERE c.slug = ${slug}
        AND c.deleted_at IS NULL
        AND g.game_id = ${gameId}
        AND g.deleted_at IS NULL
      ORDER BY r.created_at DESC, r.revision DESC
      LIMIT 1
    `;
  return (Array.isArray(rows) ? rows[0] : undefined) as
    | {
        gameId: string;
        title: string;
        manifest: unknown;
        mockRevision: null;
        packageRevision: string;
        packageRootSha256: string;
        packageBundleSha256: string;
        packageAppSetSha256: string;
        modulePolicy: unknown;
      }
    | undefined;
}

export async function getCreatorGameModuleProfile(
  slug: string,
  gameId: string,
): Promise<GameSdkModuleProfile | null> {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT g.module_policy AS "modulePolicy"
    FROM sdk_games g
    JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${slug} AND g.game_id = ${gameId}
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : undefined) as
    | { modulePolicy?: unknown }
    | undefined;
  return row
    ? normalizeGameSdkModuleProfile(row.modulePolicy)
    : null;
}

export async function updateCreatorGameModuleProfile(input: {
  slug: string;
  gameId: string;
  ownerPlayerId: string;
  updates: unknown;
}): Promise<GameSdkModuleProfile | null> {
  await ensureSdkSchema();
  const current = await getCreatorGameModuleProfile(
    input.slug,
    input.gameId,
  );
  if (!current) return null;
  const next = updateGameSdkModuleProfile(current, input.updates);
  const rows = await sdkSql()`
    UPDATE sdk_games g
    SET module_policy = ${JSON.stringify(next)}::jsonb,
        updated_at = NOW()
    FROM sdk_creators c
    WHERE g.creator_id = c.id
      AND c.slug = ${input.slug}
      AND c.owner_player_id = ${input.ownerPlayerId}
      AND g.game_id = ${input.gameId}
      AND g.deleted_at IS NULL
    RETURNING g.module_policy AS "modulePolicy"
  `;
  const saved = (Array.isArray(rows) ? rows[0] : undefined) as
    | { modulePolicy?: unknown }
    | undefined;
  return saved
    ? normalizeGameSdkModuleProfile(saved.modulePolicy)
    : null;
}
