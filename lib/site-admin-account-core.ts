import { scryptSync, timingSafeEqual } from "node:crypto";
import { siteAdminPasswordKeyLength, siteAdminPasswordMaximumLength, siteAdminPasswordMinimumLength } from "./site-admin-account-constants.ts";

export { siteAdminAccountMaximumCount, siteAdminPasswordMaximumLength, siteAdminPasswordMinimumLength } from "./site-admin-account-constants.ts";

export function normalizeSiteAdminEmail(email: string) {
  return email.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export function isValidSiteAdminEmail(email: string) {
  const normalized = normalizeSiteAdminEmail(email);
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function isValidSiteAdminAccountPassword(password: string) {
  return password.length >= siteAdminPasswordMinimumLength && password.length <= siteAdminPasswordMaximumLength;
}

export function hashSiteAdminAccountPassword(password: string, salt: string) {
  return scryptSync(password, salt, siteAdminPasswordKeyLength).toString("hex");
}

export function verifySiteAdminAccountPassword(password: string, salt: string, expectedHash: string) {
  const actual = Buffer.from(hashSiteAdminAccountPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
