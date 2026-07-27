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
  assert.match(source, /body\.action === "reset-mfa"[\s\S]*session\.scope !== "recovery"/);
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
