import { createHmac, timingSafeEqual } from "node:crypto";

export const siteAdminSessionMaxAgeSeconds = 60 * 60 * 12;
export const siteAdminRecoverySessionMaxAgeSeconds = 60 * 15;
export const siteAdminChallengeMaxAgeSeconds = 60 * 5;
export const siteAdminStepUpMaxAgeSeconds = 60 * 5;

export type SiteAdminAuthMethod = "passkey" | "recovery-code" | "master";
export type SiteAdminSessionScope = "full" | "recovery";

export type SiteAdminSessionPayload = {
  version: 2;
  expiresAt: number;
  authenticatedAt: number;
  mfaAt: number | null;
  scope: SiteAdminSessionScope;
  method: SiteAdminAuthMethod;
  email: string | null;
};

export type SiteAdminChallengePurpose = "login" | "enroll" | "step-up" | "add-passkey";
export type SiteAdminChallengePayload = {
  version: 1;
  expiresAt: number;
  email: string;
  purpose: SiteAdminChallengePurpose;
  challenge: string;
};

export function resolveSiteAdminPassword(env: Record<string, string | undefined>) {
  return env.SITE_ADMIN_PASSWORD?.trim() || env.DEBUG_MODE_PASSWORD?.trim() || null;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifySiteAdminPassword(password: string, configuredPassword: string | undefined) {
  const configured = configuredPassword?.trim();
  return Boolean(configured && safeEqual(password, configured));
}

function signature(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function signPayload(payload: object, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

function parseSignedPayload(token: string, secret: string) {
  const [encoded, receivedSignature, extra] = token.split(".");
  if (!encoded || !receivedSignature || extra || !safeEqual(receivedSignature, signature(encoded, secret))) return null;
  try { return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { return null; }
}

export function createSiteAdminToken(
  secret: string,
  input: Pick<SiteAdminSessionPayload, "scope" | "method" | "email"> = { scope: "full", method: "passkey", email: null },
  now = Date.now(),
) {
  const maxAge = input.scope === "recovery" ? siteAdminRecoverySessionMaxAgeSeconds : siteAdminSessionMaxAgeSeconds;
  const payload: SiteAdminSessionPayload = {
    version: 2,
    expiresAt: now + maxAge * 1_000,
    authenticatedAt: now,
    mfaAt: input.method === "master" ? null : now,
    ...input,
  };
  return signPayload(payload, secret);
}

export function refreshSiteAdminMfaToken(token: string, secret: string, now = Date.now()) {
  const payload = parseSiteAdminToken(token, secret, now);
  if (!payload || payload.scope !== "full") return null;
  return signPayload({ ...payload, mfaAt: now }, secret);
}

export function parseSiteAdminToken(token: string, secret: string, now = Date.now()): SiteAdminSessionPayload | null {
  const payload = parseSignedPayload(token, secret);
  if (!payload || payload.version !== 2 || typeof payload.expiresAt !== "number" || payload.expiresAt <= now) return null;
  if (typeof payload.authenticatedAt !== "number" || (payload.mfaAt !== null && typeof payload.mfaAt !== "number")) return null;
  if (payload.scope !== "full" && payload.scope !== "recovery") return null;
  if (payload.method !== "passkey" && payload.method !== "recovery-code" && payload.method !== "master") return null;
  if (payload.email !== null && typeof payload.email !== "string") return null;
  return payload as SiteAdminSessionPayload;
}

export function createSiteAdminChallengeToken(
  secret: string,
  input: Omit<SiteAdminChallengePayload, "version" | "expiresAt">,
  now = Date.now(),
) {
  return signPayload({ version: 1, expiresAt: now + siteAdminChallengeMaxAgeSeconds * 1_000, ...input }, secret);
}

export function parseSiteAdminChallengeToken(token: string, secret: string, now = Date.now()): SiteAdminChallengePayload | null {
  const payload = parseSignedPayload(token, secret);
  if (!payload || payload.version !== 1 || typeof payload.expiresAt !== "number" || payload.expiresAt <= now) return null;
  if (typeof payload.email !== "string" || typeof payload.challenge !== "string") return null;
  if (payload.purpose !== "login" && payload.purpose !== "enroll" && payload.purpose !== "step-up" && payload.purpose !== "add-passkey") return null;
  return payload as SiteAdminChallengePayload;
}

export function isRecentSiteAdminMfa(payload: SiteAdminSessionPayload, now = Date.now()) {
  return payload.scope === "full" && payload.mfaAt !== null && now - payload.mfaAt <= siteAdminStepUpMaxAgeSeconds * 1_000;
}
