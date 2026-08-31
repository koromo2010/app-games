import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ProductionPrivateWorkspaceImportError,
  executeProductionPrivateWorkspaceImport,
  prepareProductionPrivateWorkspaceImportPlan,
  productionPrivateWorkspaceOperationId,
  projectProductionPrivateWorkspaceImportTargetState,
  readProductionPrivateWorkspaceImportStatus,
  validateProductionPrivateWorkspaceBundle,
  type CompletedProductionPrivateWorkspaceImport,
  type ProductionPrivateWorkspaceImportAdapter,
  type ProductionPrivateWorkspaceImportBeforeState,
  type ProductionPrivateWorkspaceImportReadBack,
} from "../apps/sdk-portal/lib/production-private-workspace-import.ts";
import {
  productionPrivateWorkspaceImportRecoveryIdentity,
  productionPrivateWorkspaceImportTargetSpec,
} from "../apps/sdk-portal/lib/production-private-workspace-import-public-contract.ts";
import {
  productionPrivateWorkspaceImportObjectNames,
  productionPrivateWorkspaceImportSchemaStatements,
} from "../apps/sdk-portal/lib/production-private-workspace-import-schema.ts";
import { performProductionPrivateWorkspaceImportTotpStepUp } from "../lib/production-private-workspace-import-step-up-client.ts";
import { createStoredZip } from "../apps/sdk-portal/lib/stored-zip.ts";
import { verifyProductionPrivateWorkspaceImportFileAgainstSpec } from "../lib/production-private-workspace-import-client.ts";
import { productionPrivateWorkspaceImportPageMode } from "../lib/production-private-workspace-import-page-access.ts";

const operationDevA = "5ba6f1b1-eed4-49dd-8a26-9c9bd8969519";
const operationDevB = "1fe74192-2a7f-47da-8544-966f092dd2bb";
const creatorRowId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

const digest = (value: unknown) => sha256(canonicalJson(value));
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function syntheticBundle() {
  const target = "moi-lab2" as const;
  const gameIds = ["moi-game-1", "moi-game-2"];
  const entries: Array<{ name: string; content: Uint8Array | string }> = [];
  const ledgerGames = gameIds.map((gameId, index) => {
    const smoke = {
      manifestValidation: "PASS", clientBoot: "PASS", serverInitialization: "NOT_REQUIRED",
      basicInteraction: "PASS", statePresentationReconciliation: "PASS", requiredAssets: "PASS",
      networkDependency: "NONE", blockerCodes: [],
    };
    const originalRevision = String(index + 1).repeat(40);
    const ledger = {
      target, gameId, reconstruction: "READY", reconstructionMode: "ARTIFACT_HEAD",
      originalRevision, currentOutputSha256: sha256(`output:${gameId}`), packageRootSha256: null,
      serverBundleSha256: null, appSetSourceSha256: null, smoke, blockerCodes: [],
    };
    const workspace = {
      schemaVersion: 1, target, gameId, ownerReference: null, historicalRestorationClaim: false,
      externalWrites: 0, runtimeSmoke: smoke, authoringHead: { kind: "mock", revision: originalRevision },
      definitionBackedRebuild: null,
      provenance: { originalRevision, source: "synthetic-test-only" },
    };
    entries.push(
      { name: `games/${gameId}/workspace.json`, content: json(workspace) },
      { name: `games/${gameId}/runtime/index.html`, content: `<!doctype html><title>${index}</title>` },
      { name: `games/${gameId}/runtime/state.json`, content: json({ schemaVersion: 1, state: index }) },
    );
    return ledger;
  });
  const ledger = { schemaVersion: 1, target, games: ledgerGames };
  const ledgerBytes = Buffer.from(json(ledger));
  const manifest = {
    schemaVersion: 1, phaseId: "T-131-A4", artifactType: "PRIVATE_LOCAL_AUTHORING_WORKSPACE_BUNDLE",
    target, localParent: "98dec9adf87d3876998275b8a70326e8a8214419",
    a0: {
      bytes: 14_375_278,
      sha256: "0919a38bec7dc408f69b1ace799e7901a8ea419bf33fdb8b22bc47e0ac13a9f5",
      sourceMainCommit: "synthetic-test-only",
    },
    creatorRowId, creatorDisplayName: "synthetic-test-only", ownerReference: null,
    gameCount: 2, readyGameCount: 2, blockedGameCount: 0,
    perGameLedgerSha256: sha256(ledgerBytes), deferredHistoricalMaterialSha256: sha256("deferred"),
    state: "LOCAL_AUTHORING_WORKSPACE_READY", transferAuthorized: false,
    ownerBindingApplied: false, releasePublicationApplied: false, externalWrites: 0,
  };
  entries.push(
    { name: "workspace-manifest.json", content: json(manifest) },
    { name: "per-game-ledger.json", content: ledgerBytes },
    { name: "deferred-historical-material.json", content: json({ schemaVersion: 1, target, games: gameIds.map((gameId) => ({ gameId })) }) },
  );
  const archive = createStoredZip(entries.sort((left, right) => left.name.localeCompare(right.name)));
  const identities = ledgerGames.map((game) => ({
    gameId: game.gameId,
    reconstructionMode: game.reconstructionMode,
    originalRevision: game.originalRevision,
    currentOutputSha256: game.currentOutputSha256,
    packageRootSha256: game.packageRootSha256,
    serverBundleSha256: game.serverBundleSha256,
    appSetSourceSha256: game.appSetSourceSha256,
  })).sort((left, right) => left.gameId.localeCompare(right.gameId));
  const spec = {
    target,
    bundleBytes: archive.byteLength,
    bundleSha256: sha256(archive),
    gameCount: 2,
    gameIdentitySetSha256: digest([...gameIds].sort()),
    perGameIdentitySha256: digest(identities),
  };
  return {
    archive,
    specs: { "moi-lab2": spec, "yabobojpn-lab": { ...spec, target: "yabobojpn-lab" as const } },
  };
}

function before(): ProductionPrivateWorkspaceImportBeforeState {
  return {
    targetCreatorRowId: creatorRowId,
    targetCreatorRows: 1,
    targetDeletedCreatorRows: 1,
    targetCreatorOwnerRows: 0,
    targetGameRows: 2,
    targetDeletedGameRows: 2,
    targetActiveGameRows: 0,
    targetReleaseRows: 0,
    targetCurrentReleaseRows: 0,
    recoveryOperationRows: 1,
    recoveryQuarantineGameRows: 2,
    recoveryIdentityExact: true,
    targetWorkspaceRows: 0,
    targetWorkspaceGameRows: 0,
    targetWorkspaceFileRows: 0,
    sourceStateToken: sha256("source"),
    publicStateToken: sha256("public"),
    unrelatedPrivateStateToken: sha256("private"),
  };
}

function memoryAdapter() {
  let state = before();
  const completed = new Map<string, CompletedProductionPrivateWorkspaceImport>();
  let logicalWrites = 0;
  const adapter: ProductionPrivateWorkspaceImportAdapter = {
    readBeforeState: async () => ({ ...state }),
    readCompletedOperation: async (operationId) => completed.get(operationId) ?? null,
    importAtomic: async (input) => {
      if (input.faultAt) throw new Error(input.faultAt);
      const readBack: ProductionPrivateWorkspaceImportReadBack = input.expectedReadBack;
      state = {
        ...state,
        targetWorkspaceRows: 1,
        targetWorkspaceGameRows: input.bundle.gameCount,
        targetWorkspaceFileRows: input.bundle.runtimeFileCount,
      };
      logicalWrites += 1;
      completed.set(input.operationId, {
        target: input.bundle.target,
        operationId: input.operationId,
        planReceipt: input.planReceipt,
        bundleSha256: input.bundle.bundleSha256,
        readBack,
      });
      return { replayed: false, readBack };
    },
  };
  return {
    adapter,
    completed,
    setPublicStateToken(value: string) { state = { ...state, publicStateToken: value }; },
    get logicalWrites() { return logicalWrites; },
  };
}

function code(error: unknown) {
  assert.ok(error instanceof ProductionPrivateWorkspaceImportError);
  return error.code;
}

test("Production target and A3 recovery identities are exact and immutable", () => {
  assert.equal(productionPrivateWorkspaceImportTargetSpec.target, "moi-lab2");
  assert.equal(productionPrivateWorkspaceImportTargetSpec.bundleBytes, 127_345);
  assert.equal(productionPrivateWorkspaceImportRecoveryIdentity.operationId, "fa5eca14-a961-4bd1-9e68-78a609895971");
  assert.equal(productionPrivateWorkspaceImportRecoveryIdentity.terminalReceipt, "f449b3b2114ef863ea290d26c123a40ac3038e6e9861a3a576cb5bc2b9d35162");
});

test("browser verification accepts the canonical UTF-8 stored ZIP dialect", async () => {
  const fixture = syntheticBundle();
  const file = new File([fixture.archive], "moi-lab2.bundle.zip", { type: "application/zip" });
  const result = await verifyProductionPrivateWorkspaceImportFileAgainstSpec(
    file,
    "moi-lab2",
    fixture.specs["moi-lab2"],
  );
  assert.equal(result.kind, "verified");
  if (result.kind === "verified") {
    assert.equal(result.value.bytes, fixture.archive.byteLength);
    assert.equal(result.value.sha256, fixture.specs["moi-lab2"].bundleSha256);
    assert.equal(result.value.manifest.entryCount, 9);
    assert.equal(result.value.manifest.runtimeFileCount, 4);
  }
});

test("browser verification rejects a stored ZIP whose central flags differ from the canonical dialect", async () => {
  const fixture = syntheticBundle();
  const altered = Buffer.from(fixture.archive);
  const end = altered.byteLength - 22;
  const directoryOffset = altered.readUInt32LE(end + 16);
  altered.writeUInt16LE(0, directoryOffset + 8);
  const spec = {
    ...fixture.specs["moi-lab2"],
    bundleBytes: altered.byteLength,
    bundleSha256: sha256(altered),
  };
  const file = new File([altered], "moi-lab2-invalid.bundle.zip", { type: "application/zip" });
  const result = await verifyProductionPrivateWorkspaceImportFileAgainstSpec(file, "moi-lab2", spec);
  assert.deepEqual(result, { kind: "rejected", code: "BUNDLE_CONTENT_INVALID" });
});

test("target state accepts only deleted, non-public, exact-A3 and source-absent Production state", () => {
  const ready = projectProductionPrivateWorkspaceImportTargetState("moi-lab2", before());
  assert.equal(ready.ready, true);
  for (const mutation of [
    { targetReleaseRows: 1 },
    { targetCreatorOwnerRows: 1 },
    { recoveryIdentityExact: false },
    { recoveryQuarantineGameRows: 1 },
    { targetWorkspaceRows: 1 },
  ]) {
    assert.equal(projectProductionPrivateWorkspaceImportTargetState("moi-lab2", { ...before(), ...mutation }).ready, false);
  }
});

test("the Production operation ID is deterministic and never reuses consumed Development IDs", () => {
  const fixture = syntheticBundle();
  const bundle = validateProductionPrivateWorkspaceBundle({ target: "moi-lab2", archive: fixture.archive, specs: fixture.specs });
  const first = productionPrivateWorkspaceOperationId(bundle);
  assert.equal(first, productionPrivateWorkspaceOperationId(bundle));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, operationDevA);
  assert.notEqual(first, operationDevB);
});

test("plan is write-free, execute is one logical write, and status is read-only acceptance", async () => {
  const fixture = syntheticBundle();
  const memory = memoryAdapter();
  const prepared = await prepareProductionPrivateWorkspaceImportPlan({
    target: "moi-lab2", archive: fixture.archive, specs: fixture.specs, adapter: memory.adapter,
  });
  assert.equal(prepared.response.writesPerformed, 0);
  assert.equal(prepared.response.environment, "production");
  assert.equal(prepared.response.recoveryIdentity.operationId, productionPrivateWorkspaceImportRecoveryIdentity.operationId);
  assert.equal(memory.logicalWrites, 0);
  const operationId = productionPrivateWorkspaceOperationId(prepared.bundle);
  const result = await executeProductionPrivateWorkspaceImport({
    target: "moi-lab2", archive: fixture.archive, specs: fixture.specs, adapter: memory.adapter,
    identity: { operationId, planReceipt: prepared.response.planReceipt },
  });
  assert.equal(result.logicalWrites, 1);
  assert.equal(result.nonEffects.publicExposure, 0);
  assert.equal(result.nonEffects.rooms, 0);
  assert.equal(memory.logicalWrites, 1);
  const status = await readProductionPrivateWorkspaceImportStatus({
    target: "moi-lab2", specs: fixture.specs, adapter: memory.adapter,
    identity: { operationId, planReceipt: prepared.response.planReceipt, bundleSha256: fixture.specs["moi-lab2"].bundleSha256 },
  });
  assert.equal(status.state, "completed");
  assert.equal(status.acceptance?.private, true);
  assert.equal(status.acceptance?.quarantined, true);
  assert.equal(status.acceptance?.ownerBinding, "unbound");
  assert.equal(status.acceptance?.publicExposure, 0);
  await assert.rejects(executeProductionPrivateWorkspaceImport({
    target: "moi-lab2", archive: fixture.archive, specs: fixture.specs, adapter: memory.adapter,
    identity: { operationId, planReceipt: prepared.response.planReceipt },
  }), (error) => code(error) === "PRODUCTION_PRIVATE_IMPORT_OPERATION_CONFLICT");
  assert.equal(memory.logicalWrites, 1);
  memory.setPublicStateToken(sha256("public-drift"));
  await assert.rejects(readProductionPrivateWorkspaceImportStatus({
    target: "moi-lab2", specs: fixture.specs, adapter: memory.adapter,
    identity: { operationId, planReceipt: prepared.response.planReceipt, bundleSha256: fixture.specs["moi-lab2"].bundleSha256 },
  }), (error) => code(error) === "PRODUCTION_PRIVATE_IMPORT_CONCURRENT_CHANGE");
});

test("wrong Production operation identity and failed atomic execution perform zero writes", async () => {
  const fixture = syntheticBundle();
  const memory = memoryAdapter();
  const prepared = await prepareProductionPrivateWorkspaceImportPlan({
    target: "moi-lab2", archive: fixture.archive, specs: fixture.specs, adapter: memory.adapter,
  });
  await assert.rejects(executeProductionPrivateWorkspaceImport({
    target: "moi-lab2", archive: fixture.archive, specs: fixture.specs, adapter: memory.adapter,
    identity: { operationId: operationDevA, planReceipt: prepared.response.planReceipt },
  }), (error) => code(error) === "PRODUCTION_PRIVATE_IMPORT_OPERATION_CONFLICT");
  const operationId = productionPrivateWorkspaceOperationId(prepared.bundle);
  await assert.rejects(executeProductionPrivateWorkspaceImport({
    target: "moi-lab2", archive: fixture.archive, specs: fixture.specs, adapter: memory.adapter,
    identity: { operationId, planReceipt: prepared.response.planReceipt }, faultAt: "after-files",
  }));
  assert.equal(memory.logicalWrites, 0);
  assert.equal(memory.completed.size, 0);
});

test("schema is Production-only, target-bound, private/quarantined/unbound, and zero-public-effect", () => {
  const source = productionPrivateWorkspaceImportSchemaStatements.join("\n");
  assert.equal(productionPrivateWorkspaceImportObjectNames.length, 4);
  assert.match(source, /environment = 'production'/);
  assert.match(source, /target_key = 'moi-lab2'/);
  assert.match(source, /production-private-workspace-import-v1/);
  assert.match(source, /visibility = 'private-quarantined'/);
  assert.match(source, /owner_binding_state = 'unbound'/);
  for (const field of ["grants_created", "releases_created", "publications_created", "aliases_created", "rooms_created"]) {
    assert.match(source, new RegExp(`${field}[^\\n]+CHECK \\(${field} = 0\\)`));
  }
  assert.doesNotMatch(source, /sdk_development_private/);
});

test("development exposes preparation only while canonical main exposes execution", () => {
  assert.equal(productionPrivateWorkspaceImportPageMode({
    semanticEnvironment: "development", vercelEnvironment: "production", project: "app-games-dev", ref: "develop",
  }), "preparation");
  assert.equal(productionPrivateWorkspaceImportPageMode({
    semanticEnvironment: "production", vercelEnvironment: "production", project: "app-games", ref: "main",
  }), "execution");
  assert.equal(productionPrivateWorkspaceImportPageMode({
    semanticEnvironment: "production", vercelEnvironment: "preview", project: "app-games", ref: "main",
  }), null);
});

test("preparation UI has no upload POST controls and execution has single plan/execute/status paths", () => {
  const panel = readFileSync("app/site-admin/runtime-operations/production-private-workspace-import/moi-lab2/ProductionPrivateWorkspaceImportPanel.tsx", "utf8");
  assert.match(panel, /mode === "preparation"/);
  assert.match(panel, /この画面にはupload、plan、execute controlがありません/);
  assert.match(panel, /planUsed\.current = true/);
  assert.match(panel, /executeUsed\.current = true/);
  assert.match(panel, /execute POSTは再送しません/);
  assert.equal((panel.match(/method: "POST"/g) ?? []).length, 2);
  assert.match(panel, /method: "GET"/);
});

test("Authenticator step-up clears the secret and fails closed without an automatic retry", () => {
  const panel = readFileSync("app/site-admin/runtime-operations/production-private-workspace-import/moi-lab2/ProductionPrivateWorkspaceImportPanel.tsx", "utf8");
  assert.match(panel, /finally \{\s*setTotp\(""\);\s*setStepUpBusy\(false\);\s*\}/);
  assert.match(panel, /Authenticator確認結果が不明です。追加送信せず停止してください。/);
  assert.match(panel, /成功してもimportは自動実行されません/);
});

test("Production TOTP step-up is bounded to the auth challenge and never dispatches import", async () => {
  const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
  const result = await performProductionPrivateWorkspaceImportTotpStepUp("123456", (async (input, init) => {
    calls.push([input, init]);
    return calls.length === 1
      ? Response.json({ verified: false, totpAvailable: true })
      : Response.json({ verified: true, session: { scope: "full", mfaAt: 123 } });
  }) as typeof fetch);

  assert.deepEqual(result, { kind: "verified" });
  assert.deepEqual(calls.map(([, init]) => JSON.parse(String(init?.body))), [
    { action: "begin-totp-step-up" },
    { action: "verify-totp", totpCode: "123456" },
  ]);
  assert.equal(calls.every(([input]) => input === "/api/admin/passkeys"), true);
  assert.equal(calls.some(([input]) => String(input).includes("production-private-workspace-import")), false);
});

test("Production TOTP step-up fails closed for invalid input, responses, and transport", async () => {
  let calls = 0;
  assert.deepEqual(await performProductionPrivateWorkspaceImportTotpStepUp("12345", (async () => {
    calls += 1;
    return Response.json({ verified: true });
  }) as typeof fetch), { kind: "failed", code: "INVALID_TOTP_FORMAT" });
  assert.equal(calls, 0);

  assert.deepEqual(await performProductionPrivateWorkspaceImportTotpStepUp("123456", (async () => (
    Response.json({ error: "SITE_ADMIN_TOTP_UNAVAILABLE" }, { status: 503 })
  )) as typeof fetch), { kind: "failed", code: "SITE_ADMIN_TOTP_UNAVAILABLE" });
  assert.deepEqual(await performProductionPrivateWorkspaceImportTotpStepUp("123456", (async () => (
    Response.json({ verified: true, import: "unexpected" })
  )) as typeof fetch), { kind: "failed", code: "INVALID_RESPONSE" });
  assert.deepEqual(await performProductionPrivateWorkspaceImportTotpStepUp("123456", (async () => {
    throw new Error("transport unknown");
  }) as typeof fetch), { kind: "failed", code: "TRANSPORT_FAILED" });
});
