import { createHmac, timingSafeEqual } from "node:crypto";

export const siteAdminSessionMaxAgeSeconds = 60 * 60 * 12;
type SiteAdminPayload = { version: 1; expiresAt: number };

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

export function createSiteAdminToken(secret: string, now = Date.now()) {
  const payload: SiteAdminPayload = { version: 1, expiresAt: now + siteAdminSessionMaxAgeSeconds * 1_000 };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function parseSiteAdminToken(token: string, secret: string, now = Date.now()) {
  const [encoded, receivedSignature, extra] = token.split(".");
  if (!encoded || !receivedSignature || extra || !safeEqual(receivedSignature, signature(encoded, secret))) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<SiteAdminPayload>;
    if (payload.version !== 1 || typeof payload.expiresAt !== "number" || payload.expiresAt <= now) return null;
    return payload as SiteAdminPayload;
  } catch {
    return null;
  }
}
