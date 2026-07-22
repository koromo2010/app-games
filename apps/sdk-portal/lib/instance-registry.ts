import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";

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

function redisConfig() {
  const url = process.env.SDK_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.SDK_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("SDK instance registry is not configured.");
  return { url: url.replace(/\/$/, ""), token };
}

async function command(parts: readonly string[]) {
  const { url, token } = redisConfig();
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(parts), cache: "no-store" });
  if (!response.ok) throw new Error("SDK instance registry request failed.");
  return response.json() as Promise<{ result: unknown }>;
}

const keyFor = (slug: string) => `sdk:preview-instance:v1:${slug}`;

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
  const rows = await sdkSql()`SELECT id, slug, display_name, management_token_hash, owner_player_id FROM sdk_creators WHERE slug = ${slug} LIMIT 1`;
  return (Array.isArray(rows) ? rows[0] : undefined) as
    | { id: string; slug: string; display_name: string; management_token_hash: string; owner_player_id: string | null }
    | undefined;
}

export async function instanceSlugAvailable(slug: string) {
  if (await registeredCreator(slug)) return false;
  const response = await command(["EXISTS", keyFor(slug)]);
  return Number(response.result) === 0;
}

export async function reserveInstanceSlug(slug: string, displayName: string, ownerPlayerId?: string | null) {
  const reservationToken = randomBytes(24).toString("base64url");
  const value = JSON.stringify({ slug, displayName: displayName.slice(0, 80), status: "reserved", reservationToken, ownerPlayerId: ownerPlayerId ?? null, createdAt: new Date().toISOString() });
  const response = await command(["SET", keyFor(slug), value, "NX", "EX", String(7 * 24 * 60 * 60)]);
  if (response.result !== "OK") return null;
  const baseUrl = process.env.SDK_PORTAL_BASE_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://sdk.game-fields.com" : "https://sdk-dev.game-fields.com");
  return { slug, url: `${baseUrl}/${slug}`, reservationToken, expiresInSeconds: 7 * 24 * 60 * 60 };
}

export async function finalizeInstanceSlug(slug: string, reservationToken: string, ownerPlayerId?: string | null) {
  const reservation = await command(["GET", keyFor(slug)]);
  if (typeof reservation.result !== "string") return null;
  const value = JSON.parse(reservation.result) as { displayName?: unknown; reservationToken?: unknown; ownerPlayerId?: unknown };
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
  await command(["DEL", keyFor(slug)]);
  return { creator, managementToken };
}

export async function authenticateCreator(slug: string, managementToken: string) {
  const creator = await registeredCreator(slug);
  if (!creator || !safeTokenMatch(managementToken, creator.management_token_hash)) return null;
  return creator;
}

export async function authenticateCreatorOwner(slug: string, playerId: string) {
  const creator = await registeredCreator(slug);
  return creator?.owner_player_id === playerId ? creator : null;
}

export async function listCreatorEnvironments(ownerPlayerId: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT c.slug, c.display_name AS "displayName", COUNT(g.id)::int AS "gameCount"
    FROM sdk_creators c
    LEFT JOIN sdk_games g ON g.creator_id = c.id
    WHERE c.owner_player_id = ${ownerPlayerId}
    GROUP BY c.id, c.slug, c.display_name, c.created_at
    ORDER BY c.created_at ASC
  `;
  return rows as Array<{ slug: string; displayName: string; gameCount: number }>;
}

export async function listCreatorGames(slug: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT g.game_id AS "gameId", g.title, g.description, g.status,
           (g.mock_revision IS NOT NULL) AS "mockAvailable"
    FROM sdk_games g JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${slug} ORDER BY g.updated_at DESC
  `;
  return rows as Array<{ gameId: string; title: string; description: string; status: string; mockAvailable: boolean }>;
}

export async function getCreatorGamePreview(slug: string, gameId: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`
    SELECT g.game_id AS "gameId", g.title, g.mock_revision AS "mockRevision"
    FROM sdk_games g JOIN sdk_creators c ON c.id = g.creator_id
    WHERE c.slug = ${slug} AND g.game_id = ${gameId} AND g.mock_revision IS NOT NULL
    LIMIT 1
  `;
  return (Array.isArray(rows) ? rows[0] : undefined) as
    | { gameId: string; title: string; mockRevision: string }
    | undefined;
}
