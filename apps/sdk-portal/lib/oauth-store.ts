import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ensureSdkSchema, sdkSql } from "@/lib/sdk-postgres";

export const SDK_SCOPES = ["sdk:creator", "sdk:mock"] as const;
export const SDK_SCOPE = SDK_SCOPES.join(" ");

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function portalBaseUrl(origin?: string) {
  return process.env.SDK_PORTAL_BASE_URL?.replace(/\/$/, "")
    ?? origin
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://sdk.game-fields.com" : "https://sdk-dev.game-fields.com");
}

export function normalizeScope(value: string | null | undefined) {
  const requested = (value ?? SDK_SCOPE).split(/\s+/).filter(Boolean);
  return [...new Set(requested)].filter((scope) => SDK_SCOPES.includes(scope as typeof SDK_SCOPES[number])).join(" ");
}

export async function registerOAuthClient(input: { clientName?: string; redirectUris: string[] }) {
  await ensureSdkSchema();
  if (!input.redirectUris.length || input.redirectUris.some((uri) => {
    try { return new URL(uri).protocol !== "https:"; } catch { return true; }
  })) throw new Error("INVALID_REDIRECT_URI");
  const clientId = `gf_${token()}`;
  await sdkSql()`INSERT INTO sdk_oauth_clients (client_id, client_name, redirect_uris) VALUES (${clientId}, ${input.clientName?.slice(0, 120) ?? "AI client"}, ${JSON.stringify(input.redirectUris)}::jsonb)`;
  return clientId;
}

export async function validateOAuthClient(clientId: string, redirectUri: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`SELECT redirect_uris FROM sdk_oauth_clients WHERE client_id = ${clientId} LIMIT 1`;
  const row = (Array.isArray(rows) ? rows[0] : null) as { redirect_uris?: unknown } | null;
  return Array.isArray(row?.redirect_uris) && row.redirect_uris.includes(redirectUri);
}

export async function createAuthorizationCode(input: { clientId: string; redirectUri: string; playerId: string; scope: string; codeChallenge: string; audience: string }) {
  await ensureSdkSchema();
  const code = token();
  await sdkSql()`INSERT INTO sdk_oauth_codes (code_hash, client_id, redirect_uri, player_id, scope, audience, code_challenge, expires_at) VALUES (${hash(code)}, ${input.clientId}, ${input.redirectUri}, ${input.playerId}, ${input.scope}, ${input.audience}, ${input.codeChallenge}, NOW() + INTERVAL '5 minutes')`;
  return code;
}

export async function exchangeAuthorizationCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }) {
  await ensureSdkSchema();
  const rows = await sdkSql()`DELETE FROM sdk_oauth_codes WHERE code_hash = ${hash(input.code)} AND client_id = ${input.clientId} AND redirect_uri = ${input.redirectUri} AND expires_at > NOW() RETURNING player_id, scope, audience, code_challenge`;
  const row = (Array.isArray(rows) ? rows[0] : null) as { player_id: string; scope: string; audience: string; code_challenge: string } | null;
  if (!row) return null;
  const challenge = createHash("sha256").update(input.codeVerifier).digest("base64url");
  if (!safeEqual(challenge, row.code_challenge)) return null;
  return issueTokens(row.player_id, input.clientId, row.scope, row.audience);
}

async function issueTokens(playerId: string, clientId: string, scope: string, audience: string) {
  const accessToken = token();
  const refreshToken = token();
  await sdkSql()`INSERT INTO sdk_oauth_grants (access_token_hash, refresh_token_hash, client_id, player_id, scope, audience, access_expires_at, refresh_expires_at) VALUES (${hash(accessToken)}, ${hash(refreshToken)}, ${clientId}, ${playerId}, ${scope}, ${audience}, NOW() + INTERVAL '30 days', NOW() + INTERVAL '365 days')`;
  return { accessToken, refreshToken, scope, expiresIn: 30 * 24 * 60 * 60 };
}

export async function refreshAccessToken(refreshToken: string, clientId: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`DELETE FROM sdk_oauth_grants WHERE refresh_token_hash = ${hash(refreshToken)} AND client_id = ${clientId} AND revoked_at IS NULL AND refresh_expires_at > NOW() RETURNING player_id, scope, audience`;
  const row = (Array.isArray(rows) ? rows[0] : null) as { player_id: string; scope: string; audience: string } | null;
  return row ? issueTokens(row.player_id, clientId, row.scope, row.audience) : null;
}

export async function authenticateAccessToken(value: string, requiredScope: string, audience: string) {
  await ensureSdkSchema();
  const rows = await sdkSql()`SELECT player_id, scope FROM sdk_oauth_grants WHERE access_token_hash = ${hash(value)} AND audience = ${audience} AND revoked_at IS NULL AND access_expires_at > NOW() LIMIT 1`;
  const row = (Array.isArray(rows) ? rows[0] : null) as { player_id: string; scope: string } | null;
  if (!row || !row.scope.split(" ").includes(requiredScope)) return null;
  return { playerId: row.player_id, scope: row.scope };
}

export async function revokeOAuthToken(value: string) {
  await ensureSdkSchema();
  await sdkSql()`UPDATE sdk_oauth_grants SET revoked_at = NOW() WHERE access_token_hash = ${hash(value)} OR refresh_token_hash = ${hash(value)}`;
}
