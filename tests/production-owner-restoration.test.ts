import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createProductionOwnerBindingWriteFreePlan,
  productionOwnerRestorationFixedProductionAccountFingerprint,
  projectProductionOwnerRestorationAccount,
  projectProductionOwnerRestorationWorkspace,
  requireProductionOwnerRestorationAccountFingerprint,
  productionOwnerRestorationWorkspaceOperationId,
} from "../lib/production-owner-restoration.ts";
import { productionPrivateWorkspaceImportRecoveryIdentity } from "../apps/sdk-portal/lib/production-private-workspace-import-public-contract.ts";
import {
  resolveProductionOwnerRestorationWorkspaceCandidates,
} from "../apps/sdk-portal/lib/production-owner-restoration-store.ts";
import type { CompletedProductionPrivateWorkspaceImport } from "../apps/sdk-portal/lib/production-private-workspace-import.ts";
import {
  projectCompletedProductionPrivateWorkspaceImportDiagnostic,
} from "../apps/sdk-portal/lib/production-private-workspace-import-store.ts";

const secret = "t131-a6-owner-restoration-test-secret-value";

function completedImport(
  overrides: Partial<CompletedProductionPrivateWorkspaceImport> = {},
): CompletedProductionPrivateWorkspaceImport {
  return {
    target: "moi-lab2",
    operationId: productionOwnerRestorationWorkspaceOperationId,
    planReceipt: "d".repeat(64),
    bundleSha256: "a".repeat(64),
    readBack: {
      targetWorkspaceRows: 1,
      targetWorkspaceGameRows: 2,
      targetWorkspaceFileRows: 21,
      bundleSha256: "a".repeat(64),
      workspaceManifestSha256: "b".repeat(64),
      perGameLedgerSha256: "c".repeat(64),
      gameIdentitySetSha256: "e".repeat(64),
      perGameIdentitySha256: "f".repeat(64),
      contentSetSha256: "1".repeat(64),
      sourceStateToken: "2".repeat(64),
      publicStateToken: "3".repeat(64),
      unrelatedPrivateStateToken: "4".repeat(64),
      ownerBindingRows: 0,
      grantRows: 0,
      releaseRows: 0,
      publicationRows: 0,
      aliasRows: 0,
      roomRows: 0,
    },
    ...overrides,
  };
}

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

const canonicalDiagnosticRow: Record<string, unknown> = {
  operationRows: 1,
  operationIdExact: true,
  nonceExact: true,
  operationEnvironmentExact: true,
  intentExact: true,
  operationStateCompleted: true,
  operationStatePending: false,
  operationPhaseImported: true,
  operationPhaseLedger: false,
  terminalReceiptPresent: true,
  readBackShaPresent: true,
  workspaceRows: 1,
  workspaceIdentityExact: true,
  workspaceTargetExact: true,
  workspaceEnvironmentExact: true,
  privateQuarantined: true,
  ownerUnbound: true,
  bundleMatch: true,
  manifestMatch: true,
  ledgerMatch: true,
  remainingHashesMatch: true,
  games2: true,
  runtimeFiles21: true,
  runtimeBytesMatch: true,
  fileByteIntegrity: true,
  grants0: true,
  releases0: true,
  publications0: true,
  aliases0: true,
  rooms0: true,
  canonicalReaderMatched: true,
};

function completedImportDiagnostic(overrides: Record<string, unknown> = {}, tables = { operations: true, workspaces: true, games: true, files: true }) {
  return projectCompletedProductionPrivateWorkspaceImportDiagnostic({
    operationId: productionOwnerRestorationWorkspaceOperationId,
    tablePresence: tables,
    databaseContext: {
      selectedKey: "SDK_DATABASE_URL",
      fallbackUsed: false,
      databaseTargetFingerprint: "t".repeat(64),
      databaseNameFingerprint: "n".repeat(64),
    },
    row: { ...canonicalDiagnosticRow, ...overrides },
  });
}

test("completed-import diagnostic accepts only the complete canonical A5 contract", () => {
  const diagnostic = completedImportDiagnostic();
  assert.equal(diagnostic.canonicalReader.matched, true);
  assert.deepEqual(diagnostic.canonicalReader.excludedBy, []);
  assert.equal(diagnostic.operation.state, "completed");
  assert.equal(diagnostic.operation.phase, "imported-private");
  assert.equal(diagnostic.integrity.games2, "pass");
  assert.equal(diagnostic.integrity.runtimeFiles21, "pass");
  assert.equal(diagnostic.database.selectorMatch, true);
  assert.equal(diagnostic.database.fingerprintMatch, true);
  assert.doesNotMatch(JSON.stringify(diagnostic), /databaseUrl|host|username|token|cookie|content_bytes|credential/i);
});

test("completed-import diagnostic does not promote 1/2/21 pending or ledger-recorded operations", () => {
  const pending = completedImportDiagnostic({
    operationStateCompleted: false,
    operationStatePending: true,
    operationPhaseImported: false,
    operationPhaseLedger: true,
    canonicalReaderMatched: false,
  });
  assert.equal(pending.operation.state, "pending");
  assert.equal(pending.operation.phase, "ledger-recorded");
  assert.equal(pending.integrity.games2, "pass");
  assert.equal(pending.integrity.runtimeFiles21, "pass");
  assert.equal(pending.canonicalReader.matched, false);
  assert.ok(pending.canonicalReader.excludedBy.includes("OPERATION"));
});

test("completed-import diagnostic fails closed without either terminal receipt or read-back SHA", () => {
  for (const missing of ["terminalReceiptPresent", "readBackShaPresent"] as const) {
    const diagnostic = completedImportDiagnostic({ [missing]: false, canonicalReaderMatched: false });
    assert.equal(diagnostic.canonicalReader.matched, false);
    assert.equal(diagnostic.operation[missing], "fail");
    assert.ok(diagnostic.canonicalReader.excludedBy.includes("TERMINAL"));
  }
});

test("completed-import diagnostic records every canonical predicate family as fail-closed", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["operation multiplicity", { operationRows: 2, canonicalReaderMatched: false }, "OPERATION"],
    ["nonce", { nonceExact: false, canonicalReaderMatched: false }, "OPERATION"],
    ["workspace join", { workspaceRows: 0, canonicalReaderMatched: false }, "WORKSPACE"],
    ["quarantine", { privateQuarantined: false, canonicalReaderMatched: false }, "WORKSPACE"],
    ["owner", { ownerUnbound: false, canonicalReaderMatched: false }, "WORKSPACE"],
    ["bundle", { bundleMatch: false, canonicalReaderMatched: false }, "INTEGRITY"],
    ["manifest", { manifestMatch: false, canonicalReaderMatched: false }, "INTEGRITY"],
    ["ledger", { ledgerMatch: false, canonicalReaderMatched: false }, "INTEGRITY"],
    ["remaining hashes", { remainingHashesMatch: false, canonicalReaderMatched: false }, "INTEGRITY"],
    ["games", { games2: false, canonicalReaderMatched: false }, "INTEGRITY"],
    ["files", { runtimeFiles21: false, canonicalReaderMatched: false }, "INTEGRITY"],
    ["runtime bytes", { runtimeBytesMatch: false, canonicalReaderMatched: false }, "INTEGRITY"],
    ["file bytes", { fileByteIntegrity: false, canonicalReaderMatched: false }, "INTEGRITY"],
    ["grant", { grants0: false, canonicalReaderMatched: false }, "NON_EFFECTS"],
    ["release", { releases0: false, canonicalReaderMatched: false }, "NON_EFFECTS"],
    ["publication", { publications0: false, canonicalReaderMatched: false }, "NON_EFFECTS"],
    ["alias", { aliases0: false, canonicalReaderMatched: false }, "NON_EFFECTS"],
    ["room", { rooms0: false, canonicalReaderMatched: false }, "NON_EFFECTS"],
  ];
  for (const [name, overrides, exclusion] of cases) {
    const diagnostic = completedImportDiagnostic(overrides);
    assert.equal(diagnostic.canonicalReader.matched, false, name);
    assert.ok(diagnostic.canonicalReader.excludedBy.includes(exclusion as never), name);
  }
  const missingTable = completedImportDiagnostic({}, { operations: true, workspaces: false, games: true, files: true });
  assert.equal(missingTable.canonicalReader.matched, false);
  assert.deepEqual(missingTable.canonicalReader.excludedBy, ["TABLES"]);
  assert.equal(missingTable.workspace.join, "not-assessed");
});

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

test("Production plans lock the previously fixed exact-moi fingerprint", () => {
  assert.equal(requireProductionOwnerRestorationAccountFingerprint({
    environment: "production",
    fingerprint: productionOwnerRestorationFixedProductionAccountFingerprint,
  }), productionOwnerRestorationFixedProductionAccountFingerprint);
  assert.throws(() => requireProductionOwnerRestorationAccountFingerprint({
    environment: "production",
    fingerprint: `opf_v1_${"A".repeat(43)}`,
  }), /FINGERPRINT_CHANGED/);
  assert.equal(requireProductionOwnerRestorationAccountFingerprint({
    environment: "development",
    fingerprint: `opf_v1_${"A".repeat(43)}`,
  }), `opf_v1_${"A".repeat(43)}`);
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
  const diagnosticRoute = readFileSync("app/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/completed-import-diagnostic/route.ts", "utf8");
  const internal = readFileSync("apps/sdk-portal/app/api/internal/recovery/production-private-workspace-owner-restoration/moi-lab2/state/route.ts", "utf8");
  const diagnosticInternal = readFileSync("apps/sdk-portal/app/api/internal/recovery/production-private-workspace-owner-restoration/moi-lab2/completed-import-diagnostic/route.ts", "utf8");
  const store = readFileSync("apps/sdk-portal/lib/production-owner-restoration-store.ts", "utf8");
  const accountStore = readFileSync("lib/player-owner-restoration-admin-store.ts", "utf8");
  const panel = readFileSync("app/site-admin/runtime-operations/production-private-workspace-import/moi-lab2/ProductionOwnerRestorationPanel.tsx", "utf8");
  assert.match(accountRoute + planRoute + diagnosticRoute, /requireFullSiteAdminSession/);
  assert.match(accountRoute + planRoute + diagnosticRoute + internal + diagnosticInternal, /private, no-store/);
  assert.match(internal + diagnosticInternal, /requireSdkServiceRequest/);
  assert.doesNotMatch(accountRoute + planRoute + diagnosticRoute + internal + diagnosticInternal, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(store + accountStore, /ensure(?:Sdk|Postgres)Schema|\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.match(panel, /exact moi account fingerprint/);
  assert.match(panel, /write-free plan/);
  assert.match(panel, /completed-import diagnostic/);
  assert.match(panel, /fixed Production account fingerprint/);
  assert.doesNotMatch(panel, /disabled=\{!account \|\| planLocked\}/);
  assert.match(planRoute, /requireProductionOwnerRestorationAccountFingerprint/);
  for (const code of [
    "OWNER_RESTORATION_ACCOUNT_FINGERPRINT_CHANGED",
    "OWNER_RESTORATION_INTERNAL_AUTH_REJECTED",
    "OWNER_RESTORATION_WORKSPACE_NOT_FOUND",
    "OWNER_RESTORATION_WORKSPACE_UNAVAILABLE",
    "OWNER_RESTORATION_WORKSPACE_RESPONSE_INVALID",
    "OWNER_RESTORATION_PLAN_INPUT_INVALID",
  ]) assert.match(planRoute + panel, new RegExp(code));
  assert.doesNotMatch(panel, /moi2|moiwai/);
  assert.match(diagnosticRoute + diagnosticInternal, /OWNER_RESTORATION_DIAGNOSTIC_UNAVAILABLE/);
  assert.doesNotMatch(diagnosticRoute + diagnosticInternal, /ensure(?:Sdk|Postgres)Schema|\b(?:INSERT|UPDATE|DELETE)\b/i);
});

test("owner restoration locks the completed A5 workspace operation, not the pre-import A3 recovery identity", () => {
  assert.equal(productionOwnerRestorationWorkspaceOperationId, "06eb6940-fd24-59b0-8d00-47eba9a9ce8c");
  assert.notEqual(productionOwnerRestorationWorkspaceOperationId, "06eb6940-f624-59b0-8d00-47eba9a9cec8");
  assert.notEqual(productionOwnerRestorationWorkspaceOperationId, productionPrivateWorkspaceImportRecoveryIdentity.operationId);
  assert.equal(resolveProductionOwnerRestorationWorkspaceCandidates([
    completedImport({ operationId: "06eb6940-f624-59b0-8d00-47eba9a9cec8" }),
  ]), null);
  const store = readFileSync("apps/sdk-portal/lib/production-owner-restoration-store.ts", "utf8");
  const panel = readFileSync("app/site-admin/runtime-operations/production-private-workspace-import/moi-lab2/ProductionOwnerRestorationPanel.tsx", "utf8");
  assert.match(store, /productionOwnerRestorationWorkspaceOperationId/);
  assert.match(panel, /06eb6940-fd24-59b0-8d00-47eba9a9ce8c/);
  assert.doesNotMatch(store + panel, /06eb6940-f624-59b0-8d00-47eba9a9cec8/);
  assert.doesNotMatch(store + panel, /fa5eca14-a961-4bd1-9e68-78a609895971/);
});

test("owner restoration resolves one canonical A5 completed import and creates one stable plan", () => {
  const source = resolveProductionOwnerRestorationWorkspaceCandidates([completedImport()]);
  assert.ok(source);
  assert.deepEqual({
    workspaceIdentity: source.workspaceIdentity,
    operationId: source.operationId,
    workspaceRows: source.workspaceRows,
    gameRows: source.gameRows,
    fileRows: source.fileRows,
    visibility: source.visibility,
    ownerBinding: source.ownerBinding,
    grants: source.grants,
  }, {
    workspaceIdentity: productionOwnerRestorationWorkspaceOperationId,
    operationId: productionOwnerRestorationWorkspaceOperationId,
    workspaceRows: 1,
    gameRows: 2,
    fileRows: 21,
    visibility: "private-quarantined",
    ownerBinding: "unbound",
    grants: 0,
  });
  const projected = projectProductionOwnerRestorationWorkspace({ workspace: source, environment: "production", secret });
  const first = createProductionOwnerBindingWriteFreePlan({ account: account(), workspace: projected, environment: "production", secret });
  const second = createProductionOwnerBindingWriteFreePlan({ account: account(), workspace: projected, environment: "production", secret });
  assert.equal(first.planReceipt, second.planReceipt);
  assert.equal(first.plannedEffect.ownerBindings, 1);
  assert.deepEqual(first.nonEffects, { grants: 0, releases: 0, publications: 0, aliases: 0, rooms: 0 });
});

test("owner restoration lookup fails closed for absent, duplicate, wrong operation, or invalid state", () => {
  const exact = completedImport();
  assert.equal(resolveProductionOwnerRestorationWorkspaceCandidates([]), null);
  assert.equal(resolveProductionOwnerRestorationWorkspaceCandidates([exact, exact]), null);
  assert.equal(resolveProductionOwnerRestorationWorkspaceCandidates([
    completedImport({ operationId: productionPrivateWorkspaceImportRecoveryIdentity.operationId }),
  ]), null);

  const invalid = resolveProductionOwnerRestorationWorkspaceCandidates([
    completedImport({ readBack: { ...exact.readBack, targetWorkspaceFileRows: 20 } }),
  ]);
  assert.ok(invalid);
  assert.throws(() => projectProductionOwnerRestorationWorkspace({ workspace: invalid, environment: "production", secret }), /WORKSPACE_STATE_INVALID/);
});

test("owner restoration uses the same fixed Production SDK origin as A5", () => {
  const proxy = readFileSync("lib/production-private-workspace-import-proxy.ts", "utf8");
  const planRoute = readFileSync("app/api/admin/sdk-production-private-workspace-owner-restoration/moi-lab2/plan/route.ts", "utf8");
  assert.match(proxy, /productionOwnerRestorationInternalUrl/);
  assert.match(proxy, /https:\/\/sdk\.game-fields\.com/);
  assert.match(planRoute, /productionOwnerRestorationInternalUrl\(\)/);
  assert.match(planRoute, /isCanonicalProductionPlatformRuntime/);
  assert.doesNotMatch(planRoute, /sdkPromotionInternalBaseUrl|SDK_PROMOTION_INTERNAL_URL/);
});
