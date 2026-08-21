import assert from "node:assert/strict";
import test from "node:test";
import {
  canConsumeSiteAdminTotpCounter,
  createSiteAdminTotpCode,
  decryptSiteAdminTotpSecret,
  encryptSiteAdminTotpSecret,
  findSiteAdminTotpCounter,
  siteAdminTotpCounter,
} from "../lib/site-admin-totp-core.ts";
import { createSiteAdminToken, parseSiteAdminToken } from "../lib/site-admin-auth-core.ts";

// RFC 6238 Appendix B test secret. It is synthetic and never a product credential.
const syntheticTotpSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

test("site admin TOTP accepts a normal six-digit RFC 6238 code and rejects a wrong code", () => {
  const counter = siteAdminTotpCounter(59_000);
  const code = createSiteAdminTotpCode(syntheticTotpSecret, counter);
  assert.equal(code, "287082");
  assert.equal(findSiteAdminTotpCounter(syntheticTotpSecret, code, 59_000), counter);
  assert.equal(findSiteAdminTotpCounter(syntheticTotpSecret, "287083", 59_000), null);
  assert.equal(findSiteAdminTotpCounter(syntheticTotpSecret, "not-a-code", 59_000), null);
});

test("site admin TOTP accepts one time boundary period and rejects expired codes", () => {
  const firstCounter = siteAdminTotpCounter(29_999);
  const firstCode = createSiteAdminTotpCode(syntheticTotpSecret, firstCounter);
  assert.equal(findSiteAdminTotpCounter(syntheticTotpSecret, firstCode, 30_000), firstCounter);
  assert.equal(findSiteAdminTotpCounter(syntheticTotpSecret, firstCode, 60_000), null);
});

test("site admin TOTP counters reject replay and only advance", () => {
  assert.equal(canConsumeSiteAdminTotpCounter(null, 42), true);
  assert.equal(canConsumeSiteAdminTotpCounter(41, 42), true);
  assert.equal(canConsumeSiteAdminTotpCounter(42, 42), false);
  assert.equal(canConsumeSiteAdminTotpCounter(43, 42), false);
});

test("site admin TOTP secrets are encrypted at rest and fail closed with a different key", () => {
  const encrypted = encryptSiteAdminTotpSecret(syntheticTotpSecret, "synthetic-encryption-key");
  assert.equal(encrypted.ciphertext.includes(syntheticTotpSecret), false);
  assert.equal(decryptSiteAdminTotpSecret(encrypted, "synthetic-encryption-key"), syntheticTotpSecret);
  assert.throws(() => decryptSiteAdminTotpSecret(encrypted, "wrong-synthetic-encryption-key"), /SITE_ADMIN_TOTP_SECRET_UNAVAILABLE/);
});

test("a successful TOTP can establish a signed full session, while tampered or expired sessions fail", () => {
  const now = 1_700_000_000_000;
  const token = createSiteAdminToken("synthetic-session-key", {
    scope: "full",
    method: "totp",
    email: "admin@example.test",
  }, now);
  assert.equal(parseSiteAdminToken(token, "synthetic-session-key", now)?.method, "totp");
  assert.equal(parseSiteAdminToken(`${token}x`, "synthetic-session-key", now), null);
  assert.equal(parseSiteAdminToken(token, "synthetic-session-key", now + (12 * 60 * 60 * 1_000)), null);
});
