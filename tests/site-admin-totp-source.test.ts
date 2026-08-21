import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("TOTP is a post-password alternative that preserves the passkey path", () => {
  const login = read("app/api/admin/site-settings/route.ts");
  const mfaRoute = read("app/api/admin/passkeys/route.ts");
  const passkey = read("lib/site-admin-passkey.ts");
  assert.match(login, /verifySiteAdminAccount\(normalizedEmail, password\)/);
  assert.match(login, /siteAdminAuthenticationOptions\(normalizedEmail\)/);
  assert.match(login, /totpAvailable: totp\.enabled/);
  assert.match(mfaRoute, /action === "verify-totp"[\s\S]*challenge\.purpose !== "login" && challenge\.purpose !== "step-up"/);
  assert.match(passkey, /authenticatorAttachment:\s*"platform"/);
  assert.match(passkey, /allowCredentials:[\s\S]*transports:\s*\["internal"\]/);
});

test("TOTP enrollment and reset remain same-owner recent-MFA operations without secret audit payloads", () => {
  const route = read("app/api/admin/passkeys/route.ts");
  const panel = read("app/admin/AdminAccountsPanel.tsx");
  assert.match(route, /action === "begin-totp-enrollment"[\s\S]*requireFullSiteAdminSession\(\)[\s\S]*isRecentSiteAdminMfa\(session\)[\s\S]*session\.email/);
  assert.match(route, /action === "verify-totp-enrollment"[\s\S]*challenge\.purpose !== "enroll-totp"[\s\S]*session\.email !== challenge\.email/);
  assert.match(route, /action === "reset-totp"[\s\S]*requireFullSiteAdminSession\(\)[\s\S]*isRecentSiteAdminMfa\(session\)/);
  assert.match(route, /function privateJson[\s\S]*Cache-Control[\s\S]*no-store/);
  assert.doesNotMatch(route, /appendSiteAdminAuditLog\([^\n]*enrollment\.secret/);
  assert.match(panel, /Authenticatorを追加/);
  assert.match(panel, /Authenticatorの6桁コード/);
});

test("TOTP storage encrypts secrets and atomically rejects replay while rate limiting failures", () => {
  const core = read("lib/site-admin-totp-core.ts");
  const store = read("lib/site-admin-totp-store.ts");
  const route = read("app/api/admin/passkeys/route.ts");
  const limits = read("lib/rate-limit-core.ts");
  assert.match(core, /createCipheriv\("aes-256-gcm"/);
  assert.match(core, /createDecipheriv\("aes-256-gcm"/);
  assert.match(store, /secret_ciphertext/);
  assert.match(store, /last_used_counter < \$\{counter\}/);
  assert.match(route, /rateLimitPolicies\.adminTotp/);
  assert.match(limits, /adminTotp:[\s\S]*identity: \{ limit: 6,[\s\S]*failClosed: true/);
});
