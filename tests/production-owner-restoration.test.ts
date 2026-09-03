import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createProductionOwnerBindingWriteFreePlan,
  projectProductionOwnerRestorationAccount,
  projectProductionOwnerRestorationWorkspace,
  productionOwnerRestorationWorkspaceOperationId,
} from "../lib/production-owner-restoration.ts";
import { productionPrivateWorkspaceImportRecoveryIdentity } from "../apps/sdk-portal/lib/production-private-workspace-import-public-contract.ts";

const secret = "t131-a6-owner-restoration-test-secret-value";

function account(environment: "production" | "development" = "production") {
  return projectProductionOwnerRestorationAccount({
    accounts: [{ username: "moi", accountIdentity: "immutable-account-identity", hasRecoveryEmail: true, grantPresent: false }],
    environment,
    secret,
  });
}

function workspace(environment: "production" | "development" = "production") {
  return projectProductionOwnerRestorationWorkspace({
    workspace: {
      workspaceIdentity: "immutable-workspace-identity",
      operationId: productionOwnerRestorationWorkspaceOperationId,
      bundleSha256: "a".repeat(64), workspaceManifestSha256: "b".repeat(64), perGameLedgerSha256: "c".repeat(64),
      workspaceRows: 1, gameRows: 2, fileRows: 21,
      visibility: "private-quarantined", ownerBinding: "unbound",
      grants: 0, releases: 0, publications: 0, aliases: 0, rooms: 0,
    },
    environment,
    secret,
  });
}

test("exact moi projection is strict, opaque, stable, and environment-bound", () => {
  const production = account();
  assert.deepEqual(Object.keys(production).sort(), ["schemaVersion", "environment", "target", "selectionBasis", "username", "accountState", "grant", "fingerprint"].sort());
  assert.equal(production.username, "moi");
  assert.equal(production.selectionBasis, "OPERATOR_SELECTED_RESTORATION_TARGET");
  assert.equal(production.grant, "absent");
  assert.match(production.fingerprint, /^opf_v1_[A-Za-z0-9_-]{43}$/);
  assert.equal(account().fingerprint, production.fingerprint);
  assert.notEqual(account("development").fingerprint, production.fingerprint);
  assert.doesNotMatch(JSON.stringify(production), /immutable-account-identity|email|provider|subject|credential|token|cookie|playerId|accountId/i);
});

test("account projection fails closed for missing, duplicate, different, or unsafe identity", () => {
  assert.throws(() => projectProductionOwnerRestorationAccount({ accounts: [], environment: "production", secret }), /NOT_FOUND/);
  assert.throws(() => projectProductionOwnerRestorationAccount({ accounts: [
    { username: "moi", accountIdentity: "one", hasRecoveryEmail: true, grantPresent: false },
    { username: "moi", accountIdentity: "two", hasRecoveryEmail: true, grantPresent: false },
  ], environment: "production", secret }), /AMBIGUOUS/);
  assert.throws(() => projectProductionOwnerRestorationAccount({ accounts: [
    { username: "moi2", accountIdentity: "one", hasRecoveryEmail: true, grantPresent: false },
  ], environment: "production", secret }), /NOT_FOUND/);
  assert.throws(() => projectProductionOwnerRestorationAccount({ accounts: [
    { username: "moi", accountIdentity: "one", hasRecoveryEmail: true, grantPresent: false },
  ], environment: "production", secret: "short" }), /SECRET_NOT_CONFIGURED/);
});

test("workspace projection and plan lock exact A5 identity, counts, state, and zero non-effects", () => {
  const projectedWorkspace = workspace();
  const projectedAccount = account();
  const plan = createProductionOwnerBindingWriteFreePlan({ account: projectedAccount, workspace: projectedWorkspace, environment: "production", secret });
  assert.deepEqual(plan.counts, { workspaces: 1, games: 2, runtimeFiles: 21 });
  assert.deepEqual(plan.plannedEffect, { ownerBindings: 1, ownerUsername: "moi", visibilityAfter: "private-quarantined", quarantinedAfter: true, publicAfter: false });
  assert.deepEqual(plan.nonEffects, { grants: 0, releases: 0, publications: 0, aliases: 0, rooms: 0 });
  assert.match(projectedWorkspace.stateToken, /^wst_v1_[A-Za-z0-9_-]{43}$/);
  assert.match(plan.planReceipt, /^obp_v1_[A-Za-z0-9_-]{43}$/);
  assert.equal(createProductionOwnerBindingWriteFreePlan({ account: projectedAccount, workspace: projectedWorkspace, environment: "production", secret }).planReceipt, plan.planReceipt);
  const changedAccount = account("development");
  assert.throws(() => createProductionOwnerBindingWriteFreePlan({ account: changedAccount, workspace: projectedWorkspace, environment: "production", secret }), /PLAN_INPUT_INVALID/);
});

test("workspace state change invalidates the plan receipt and invalid state fails closed", () => {
  const base = workspace();
  const source = {
    workspaceIdentity: "immutable-workspace-identity", operationId: productionOwnerRestorationWorkspaceOperationId,
    bundleSha256: "a".repeat(64), workspaceManifestSha256: "b".repeat(64), perGameLedgerSha256: "c".repeat(64),
    workspaceRows: 1, gameRows: 2, fileRows: 21, visibility: "private-quarantined", ownerBinding: "unbound",
    grants: 0, releases: 0, publications: 0, aliases: 0, rooms: 0,
  };
  const changed = projectProductionOwnerRestorationWorkspace({ workspace: { ...source, workspaceIdentity: "different-workspace-identity" }, environment: "production", secret });
  assert.notEqual(changed.stateToken, base.stateToken);
  assert.notEqual(createProductionOwnerBindingWriteFreePlan({ account: account(), workspace: changed, environment: "production", secret }).planReceipt,
    createProductionOwnerBindingWriteFreePlan({ account: account(), workspace: base, environment: "production", secret }).planReceipt);
  assert.throws(() => projectProductionOwnerRestorationWorkspace({ workspace: { ...source, grants: 1 }, environment: "production", secret }), /WORKSPACE_STATE_INVALID/);
});

test("routes and UI are GET-only, exact-target, no-store, and contain no binding write", () => {
  const accountRoute = readFileSync("app/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/account/route.ts", "utf8");
  const planRoute = readFileSync("app/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/plan/route.ts", "utf8");
  const internal = readFileSync("apps/sdk-portal/app/api/internal/recovery/production-private-workspace-owner-restoration/moi-lab2/state/route.ts", "utf8");
  const store = readFileSync("apps/sdk-portal/lib/production-owner-restoration-store.ts", "utf8");
  const accountStore = readFileSync("lib/player-owner-restoration-admin-store.ts", "utf8");
  const panel = readFileSync("app/site-admin/runtime-operations/production-private-workspace-import/moi-lab2/ProductionOwnerRestorationPanel.tsx", "utf8");
  assert.match(accountRoute + planRoute, /requireFullSiteAdminSession/);
  assert.match(accountRoute + planRoute + internal, /private, no-store/);
  assert.match(internal, /requireSdkServiceRequest/);
  assert.doesNotMatch(accountRoute + planRoute + internal, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(store + accountStore, /ensure(?:Sdk|Postgres)Schema|\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.match(panel, /exact moi account fingerprint/);
  assert.match(panel, /write-free plan/);
  assert.doesNotMatch(panel, /moi2|moiwai/);
});

test("owner restoration locks the completed A5 workspace operation, not the pre-import A3 recovery identity", () => {
  assert.equal(productionOwnerRestorationWorkspaceOperationId, "06eb6940-f624-59b0-8d00-47eba9a9cec8");
  assert.notEqual(productionOwnerRestorationWorkspaceOperationId, productionPrivateWorkspaceImportRecoveryIdentity.operationId);
  const store = readFileSync("apps/sdk-portal/lib/production-owner-restoration-store.ts", "utf8");
  const panel = readFileSync("app/site-admin/runtime-operations/production-private-workspace-import/moi-lab2/ProductionOwnerRestorationPanel.tsx", "utf8");
  assert.match(store, /productionOwnerRestorationWorkspaceOperationId/);
  assert.match(panel, /06eb6940-f624-59b0-8d00-47eba9a9cec8/);
  assert.doesNotMatch(store + panel, /fa5eca14-a961-4bd1-9e68-78a609895971/);
});
