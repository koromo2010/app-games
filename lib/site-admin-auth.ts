import { cookies } from "next/headers";
import { createSiteAdminToken, parseSiteAdminToken, resolveSiteAdminPassword, siteAdminSessionMaxAgeSeconds } from "@/lib/site-admin-auth-core";

export const siteAdminCookieName = "game-fields-site-admin";

function siteAdminSecret() {
  const password = resolveSiteAdminPassword(process.env);
  if (!password) throw new Error("SITE_ADMIN_PASSWORD_NOT_CONFIGURED");
  const sessionSecret = process.env.PLAYER_SESSION_SECRET || process.env.LLM_SESSION_SECRET || password;
  return `game-fields-site-admin:${sessionSecret}:${password}`;
}

export async function setSiteAdminCookie() {
  const store = await cookies();
  store.set(siteAdminCookieName, createSiteAdminToken(siteAdminSecret()), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: siteAdminSessionMaxAgeSeconds });
}

export async function clearSiteAdminCookie() {
  const store = await cookies();
  store.set(siteAdminCookieName, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function hasSiteAdminSession() {
  const store = await cookies();
  const token = store.get(siteAdminCookieName)?.value;
  return Boolean(token && parseSiteAdminToken(token, siteAdminSecret()));
}

export async function requireSiteAdminSession() {
  if (!(await hasSiteAdminSession())) throw new Error("SITE_ADMIN_AUTH_REQUIRED");
}

export function isSiteAdminConfigurationError(error: unknown) {
  return error instanceof Error && error.message === "SITE_ADMIN_PASSWORD_NOT_CONFIGURED";
}
