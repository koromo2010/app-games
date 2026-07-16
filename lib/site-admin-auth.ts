import { cookies } from "next/headers";
import {
  createSiteAdminChallengeToken,
  createSiteAdminToken,
  isRecentSiteAdminMfa,
  parseSiteAdminChallengeToken,
  parseSiteAdminToken,
  refreshSiteAdminMfaToken,
  resolveSiteAdminPassword,
  siteAdminChallengeMaxAgeSeconds,
  siteAdminRecoverySessionMaxAgeSeconds,
  siteAdminSessionMaxAgeSeconds,
  type SiteAdminChallengePayload,
  type SiteAdminSessionPayload,
} from "@/lib/site-admin-auth-core";

export const siteAdminCookieName = "game-fields-site-admin";
export const siteAdminChallengeCookieName = "game-fields-site-admin-challenge";

function siteAdminSecret() {
  const password = resolveSiteAdminPassword(process.env);
  if (!password) throw new Error("SITE_ADMIN_PASSWORD_NOT_CONFIGURED");
  const sessionSecret = process.env.PLAYER_SESSION_SECRET || process.env.LLM_SESSION_SECRET || password;
  return `game-fields-site-admin:${sessionSecret}:${password}`;
}

const cookieBase = { httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export async function setSiteAdminCookie(input: Pick<SiteAdminSessionPayload, "scope" | "method" | "email">) {
  const store = await cookies();
  const maxAge = input.scope === "recovery" ? siteAdminRecoverySessionMaxAgeSeconds : siteAdminSessionMaxAgeSeconds;
  store.set(siteAdminCookieName, createSiteAdminToken(siteAdminSecret(), input), { ...cookieBase, maxAge });
}

export async function setSiteAdminChallengeCookie(input: Omit<SiteAdminChallengePayload, "version" | "expiresAt">) {
  const store = await cookies();
  store.set(siteAdminChallengeCookieName, createSiteAdminChallengeToken(siteAdminSecret(), input), { ...cookieBase, maxAge: siteAdminChallengeMaxAgeSeconds });
}

export async function readSiteAdminChallenge() {
  const store = await cookies();
  const token = store.get(siteAdminChallengeCookieName)?.value;
  return token ? parseSiteAdminChallengeToken(token, siteAdminSecret()) : null;
}

export async function clearSiteAdminChallengeCookie() {
  const store = await cookies();
  store.set(siteAdminChallengeCookieName, "", { ...cookieBase, maxAge: 0 });
}

export async function clearSiteAdminCookie() {
  const store = await cookies();
  store.set(siteAdminCookieName, "", { ...cookieBase, maxAge: 0 });
  store.set(siteAdminChallengeCookieName, "", { ...cookieBase, maxAge: 0 });
}

export async function getSiteAdminSession() {
  const store = await cookies();
  const token = store.get(siteAdminCookieName)?.value;
  return token ? parseSiteAdminToken(token, siteAdminSecret()) : null;
}

export async function hasSiteAdminSession() { return Boolean(await getSiteAdminSession()); }

export async function requireSiteAdminSession() {
  const session = await getSiteAdminSession();
  if (!session) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
  return session;
}

export async function requireFullSiteAdminSession() {
  const session = await requireSiteAdminSession();
  if (session.scope !== "full") throw new Error("SITE_ADMIN_FULL_AUTH_REQUIRED");
  return session;
}

export async function requireRecentSiteAdminMfa() {
  const session = await requireFullSiteAdminSession();
  if (!isRecentSiteAdminMfa(session)) throw new Error("SITE_ADMIN_STEP_UP_REQUIRED");
  return session;
}

export async function refreshSiteAdminMfaCookie() {
  const store = await cookies();
  const token = store.get(siteAdminCookieName)?.value;
  const refreshed = token ? refreshSiteAdminMfaToken(token, siteAdminSecret()) : null;
  if (!refreshed) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
  store.set(siteAdminCookieName, refreshed, { ...cookieBase, maxAge: siteAdminSessionMaxAgeSeconds });
}

export function publicSiteAdminSession(session: SiteAdminSessionPayload) {
  return { scope: session.scope, method: session.method, email: session.email, expiresAt: session.expiresAt, mfaAt: session.mfaAt };
}

export function isSiteAdminConfigurationError(error: unknown) {
  return error instanceof Error && error.message === "SITE_ADMIN_PASSWORD_NOT_CONFIGURED";
}

export function siteAdminAuthorizationError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === "SITE_ADMIN_AUTH_REQUIRED") return Response.json({ error: "ADMIN_AUTH_REQUIRED" }, { status: 401 });
  if (error.message === "SITE_ADMIN_FULL_AUTH_REQUIRED") return Response.json({ error: "ADMIN_FULL_AUTH_REQUIRED" }, { status: 403 });
  if (error.message === "SITE_ADMIN_STEP_UP_REQUIRED") return Response.json({ error: "ADMIN_STEP_UP_REQUIRED" }, { status: 403 });
  if (isSiteAdminConfigurationError(error)) return Response.json({ error: "SITE_ADMIN_PASSWORD_NOT_CONFIGURED" }, { status: 503 });
  return null;
}
