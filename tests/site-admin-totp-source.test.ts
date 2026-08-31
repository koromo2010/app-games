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
  const panel = read("app/admin/SiteAdminPanel.tsx");
  assert.match(login, /verifySiteAdminAccount\(normalizedEmail, password\)/);
  assert.match(login, /siteAdminAuthenticationOptions\(normalizedEmail\)/);
  assert.match(login, /totpAvailable: totp\.enabled/);
  assert.match(mfaRoute, /action === "verify-totp"[\s\S]*challenge\.purpose !== "login" && challenge\.purpose !== "step-up"/);
  assert.match(panel, /setTotpAvailable\(data\.totpAvailable === true\)/);
  assert.match(panel, /mfaMode === "login" && totpAvailable && <form onSubmit=\{completeTotp\}/);
  assert.match(panel, /action: "verify-totp", totpCode/);
  assert.match(panel, /totpAvailable \? "Windows Helloまたは登録済みAuthenticatorの6桁コードでログインを完了します。" : "Windows Helloまたは下の一回限りの復旧コードでログインを完了します。Authenticatorの6桁コードはこのログインでは利用できず、復旧コード欄に入力しないでください。"/);
  assert.match(passkey, /authenticatorAttachment:\s*"platform"/);
  assert.match(passkey, /allowCredentials:[\s\S]*transports:\s*\["internal"\]/);
});

test("confirmed enrollment projects TOTP availability into its own next-login input", () => {
  const store = read("lib/site-admin-totp-store.ts");
  const login = read("app/api/admin/site-settings/route.ts");
  const panel = read("app/admin/SiteAdminPanel.tsx");
  assert.match(store, /enabled: Boolean\(row\?\.confirmed_at\)/);
  assert.match(store, /SET confirmed_at = \$\{now\}, enrollment_challenge_hash = NULL, last_used_counter = \$\{counter\}/);
  assert.match(login, /totpAvailable: totp\.enabled/);
  assert.match(panel, /setTotpAvailable\(data\.totpAvailable === true\)/);
  const totpForm = panel.slice(panel.indexOf('<form onSubmit={completeTotp}'), panel.indexOf('{mfaMode === "login" && <form onSubmit={useRecoveryCode}'));
  const totpHandler = panel.slice(panel.indexOf("const completeTotp"), panel.indexOf("const useRecoveryCode"));
  const recoveryStart = panel.indexOf('<form onSubmit={useRecoveryCode}');
  const recoveryForm = panel.slice(recoveryStart, panel.indexOf('{message && <p role="alert"', recoveryStart));
  assert.match(totpForm, /Authenticatorの6桁コード/);
  assert.match(totpHandler, /action: "verify-totp", totpCode/);
  assert.match(recoveryForm, /一回限りの復旧コード/);
  assert.match(recoveryForm, /Authenticatorの6桁コードはこの欄に入力しません/);
  assert.doesNotMatch(recoveryForm, /totpCode/);
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
  assert.match(panel, /QRCodeSVG value=\{totpEnrollment\.provisioningUri\}/);
  assert.match(panel, /外部サービスへ送信せず、画像や値を保存しません/);
  assert.match(panel, /セットアップキー（QRコードを使えない場合）/);
  assert.match(panel, /Authenticatorの6桁コード/);
});

test("Migration 011 TOTP step-up requires a full owner session and records no code or credential", () => {
  const route = read("app/api/admin/passkeys/route.ts");
  const panel = read("app/site-admin/runtime-operations/sdk-migration-011/SdkMigration011OperatorPanel.tsx");
  const stepUp = read("lib/sdk-migration-011-step-up-client.ts");
  assert.match(route, /action === "begin-totp-step-up"[\s\S]*requireFullSiteAdminSession\(\)[\s\S]*isRecentSiteAdminMfa\(session\)[\s\S]*siteAdminTotpStatus\(session\.email\)/);
  assert.match(route, /action === "verify-totp"[\s\S]*challenge\.purpose === "step-up" \? await requireFullSiteAdminSession\(\)/);
  assert.doesNotMatch(route, /appendSiteAdminAuditLog\([^\n]*totpCode/);
  assert.match(panel, /autoComplete="one-time-code"/);
  assert.doesNotMatch(panel + stepUp, /localStorage|sessionStorage|console\.|document\.cookie/);
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
