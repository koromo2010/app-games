import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const fullSessionReadRoutes = [
  "app/api/admin/app-releases/route.ts",
  "app/api/admin/debug-access/route.ts",
  "app/api/admin/dev-release/route.ts",
  "app/api/admin/game-operations/route.ts",
  "app/api/admin/hyperparameters/route.ts",
  "app/api/admin/sdk-promotions/route.ts",
  "app/api/admin/tahoiya-decoy-salvage/route.ts",
  "app/api/admin/vocabulary-drafts/route.ts",
  "app/api/admin/vocabulary-evaluations/route.ts",
] as const;

test("regular admin data routes reject break-glass recovery sessions", () => {
  for (const path of fullSessionReadRoutes) {
    assert.match(read(path), /requireFullSiteAdminSession\(\)/, path);
  }
});

test("break-glass sessions cannot create, update, or delete admin accounts", () => {
  const source = read("app/api/admin/accounts/route.ts");
  const post = source.slice(
    source.indexOf("export async function POST"),
    source.indexOf("export async function PATCH"),
  );
  const deleteHandler = source.slice(source.indexOf("export async function DELETE"));
  assert.match(post, /const session = await requireRecentSiteAdminMfa\(\)/);
  assert.doesNotMatch(post, /session\.scope === "full"/);
  assert.match(deleteHandler, /const session = await requireRecentSiteAdminMfa\(\)/);
  assert.doesNotMatch(deleteHandler, /session\.scope === "full"/);
  assert.match(source, /body\.action === "reset-mfa"[\s\S]*resettingOwnAccount = session\.scope === "full" && session\.email === email/);
  assert.match(source, /session\.scope !== "recovery" && !resettingOwnAccount/);
  assert.match(source, /resettingOwnAccount \? await requireRecentSiteAdminMfa\(\) : session/);
});

test("full administrators can only reset their own passkeys after recent MFA", () => {
  const route = read("app/api/admin/accounts/route.ts");
  const panel = read("app/admin/AdminAccountsPanel.tsx");
  assert.match(route, /resettingOwnAccount = session\.scope === "full" && session\.email === email/);
  assert.match(route, /resettingOwnAccount \? await requireRecentSiteAdminMfa\(\) : session/);
  assert.match(route, /resetOwnAccount: resettingOwnAccount/);
  assert.match(panel, /const stepUpSession = !recoveryMode \? await ensureSiteAdminStepUp\(\) : null/);
  assert.match(panel, /stepUpSession\?\.method === "recovery-code"[\s\S]*onRecoveryCodeSessionEstablished/);
  assert.match(panel, /!recoveryMode && currentEmail === account\.email && account\.passkeyCount > 0/);
  assert.match(panel, /パスキー初期化/);
  assert.match(panel, /recoveryMode && account\.passkeyCount > 0/);
  assert.match(panel, /MFAを再設定/);
});

test("recovery codes can satisfy a same-admin step-up without widening recovery scope", () => {
  const route = read("app/api/admin/passkeys/route.ts");
  const recoveryBranch = route.slice(
    route.indexOf('if (action === "use-recovery-code")'),
    route.indexOf('return Response.json({ error: "INVALID_REQUEST"'),
  );
  const client = read("lib/site-admin-passkey-client.ts");
  const panel = read("app/admin/SiteAdminPanel.tsx");
  assert.match(recoveryBranch, /challenge\.purpose !== "login" && challenge\.purpose !== "step-up"/);
  assert.match(recoveryBranch, /challenge\.purpose === "step-up"[\s\S]*requireFullSiteAdminSession\(\)/);
  assert.match(recoveryBranch, /current\.email !== challenge\.email[\s\S]*SITE_ADMIN_CHALLENGE_INVALID/);
  assert.ok(recoveryBranch.indexOf("requireFullSiteAdminSession()") < recoveryBranch.indexOf("consumeSiteAdminRecoveryCode(challenge.email"));
  assert.match(recoveryBranch, /method: "recovery-code"/);
  assert.match(recoveryBranch, /admin\.recovery-code-step-up/);
  assert.match(client, /data\.session\.method !== "recovery-code"/);
  assert.match(client, /return await completeStepUpWithRecoveryCode\(\)/);
  assert.match(panel, /onRecoveryCodeSessionEstablished[\s\S]*method: "recovery-code"/);
});

test("recovery-code repair promotes the session only after a platform passkey is added", () => {
  const route = read("app/api/admin/passkeys/route.ts");
  const panel = read("app/admin/AdminAccountsPanel.tsx");
  assert.match(route, /current\.method === "recovery-code"[\s\S]*method: "passkey"/);
  assert.match(route, /action === "remove-incompatible-passkeys"[\s\S]*requireFullSiteAdminSession/);
  assert.match(route, /action === "remove-incompatible-passkeys"[\s\S]*isRecentSiteAdminMfa/);
  assert.match(panel, /Windows Helloを登録して復旧を完了/);
  assert.match(panel, /!recoveryMode && <form onSubmit=\{save\}/);
  assert.match(panel, /\{!recoveryMode && <button[^>]*onClick=\{\(\) => void remove/);
});
