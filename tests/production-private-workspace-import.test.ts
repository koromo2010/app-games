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
import { resolveSdkProductionRuntimeIdentity } from "../apps/sdk-portal/lib/production-private-workspace-runtime-identity.ts";
import {
  productionPrivateWorkspaceImportObjectNames,
  productionPrivateWorkspaceImportSchemaStatements,
} from "../apps/sdk-portal/lib/production-private-workspace-import-schema.ts";
import { createStoredZip } from "../apps/sdk-portal/lib/stored-zip.ts";
import {
  diagnoseProductionPrivateWorkspaceImportTargetState,
  parseProductionPrivateWorkspaceImportPlanHttpFailure,
  parseProductionPrivateWorkspaceImportTargetStateHttpFailure,
  parseProductionPrivateWorkspaceImportTargetState,
  productionPrivateWorkspaceImportPlanSafeErrorStatuses,
  productionPrivateWorkspaceImportTargetStateSafeErrorStatuses,
  requestProductionPrivateWorkspaceImportPlan,
  requestProductionPrivateWorkspaceImportTargetState,
  verifyProductionPrivateWorkspaceImportFileAgainstSpec,
} from "../lib/production-private-workspace-import-client.ts";
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

test("SDK Production runtime identity is config-driven, source-bound, and independent of Platform APP_ENV", () => {
  const sourceCommit = "a".repeat(40);
  assert.deepEqual(resolveSdkProductionRuntimeIdentity({
    APP_ENV: "sdk",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_NAME: "app-games-sdk",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: sourceCommit,
  }), { environment: "production", sourceCommit });

  for (const missing of [
    "VERCEL_ENV",
    "VERCEL_PROJECT_NAME",
    "VERCEL_GIT_COMMIT_REF",
    "VERCEL_GIT_COMMIT_SHA",
  ] as const) {
    const environment: NodeJS.ProcessEnv = {
      VERCEL_ENV: "production",
      VERCEL_PROJECT_NAME: "app-games-sdk",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: sourceCommit,
    };
    delete environment[missing];
    assert.equal(resolveSdkProductionRuntimeIdentity(environment), null, missing);
  }

  for (const mismatch of [
    { VERCEL_ENV: "preview" },
    { VERCEL_PROJECT_NAME: "app-games-sdk-dev" },
    { VERCEL_GIT_COMMIT_REF: "develop" },
    { VERCEL_GIT_COMMIT_SHA: "not-a-source-commit" },
    { VERCEL_GIT_COMMIT_SHA: "0".repeat(40) },
    { VERCEL_GIT_COMMIT_SHA: "0".repeat(64) },
  ]) {
    assert.equal(resolveSdkProductionRuntimeIdentity({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_NAME: "app-games-sdk",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: sourceCommit,
      ...mismatch,
    }), null);
  }
});

test("target-state, plan, execute, and status use one fail-closed secret-free SDK runtime resolver", () => {
  const routePaths = [
    "apps/sdk-portal/app/api/internal/recovery/production-private-workspace-import/[target]/target-state/route.ts",
    "apps/sdk-portal/app/api/internal/recovery/production-private-workspace-import/[target]/plan/route.ts",
    "apps/sdk-portal/app/api/internal/recovery/production-private-workspace-import/[target]/execute/route.ts",
    "apps/sdk-portal/app/api/internal/recovery/production-private-workspace-import/[target]/status/[operationId]/route.ts",
  ];
  for (const routePath of routePaths) {
    const source = readFileSync(routePath, "utf8");
    assert.equal((source.match(/resolveSdkProductionRuntimeIdentity\(\)/g) ?? []).length, 1, routePath);
    assert.doesNotMatch(source, /resolveSdkProductionRuntimeIdentity\([^)]/);
    assert.doesNotMatch(source, /process\.env\.APP_ENV|function productionRuntime/);
    assert.match(source, /Response\.json\(\{ error: "PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID" \}, \{ status: 400, headers \}\)/);
    assert.doesNotMatch(source, /sourceCommit[^\n]*(?:Response|json)|VERCEL_GIT_COMMIT_SHA[^\n]*(?:Response|json)/);
  }

  const resolver = readFileSync(
    "apps/sdk-portal/lib/production-private-workspace-runtime-identity.ts",
    "utf8",
  );
  assert.match(resolver, /main-promotion-projects\.json/);
  assert.match(resolver, /role === "production-sdk-portal"/);
  assert.doesNotMatch(resolver, /(?:process\.env|environment)\.APP_ENV|https:\/\/sdk\.game-fields\.com|[0-9a-f]{40}/);
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

test("target-state diagnostics preserve the one read response and classify every secret-free mismatch", () => {
  const readyResponse = projectProductionPrivateWorkspaceImportTargetState("moi-lab2", before());
  const parsedReady = parseProductionPrivateWorkspaceImportTargetState(readyResponse, "moi-lab2");
  assert.ok(parsedReady);
  assert.deepEqual(diagnoseProductionPrivateWorkspaceImportTargetState(
    parsedReady,
    parsedReady.creatorIdentitySha256!,
  ), []);

  const blockedResponse = projectProductionPrivateWorkspaceImportTargetState("moi-lab2", {
    ...before(),
    recoveryIdentityExact: false,
    recoveryQuarantineGameRows: 1,
    targetWorkspaceRows: 1,
  });
  const parsedBlocked = parseProductionPrivateWorkspaceImportTargetState(blockedResponse, "moi-lab2");
  assert.ok(parsedBlocked);
  const failures = diagnoseProductionPrivateWorkspaceImportTargetState(
    parsedBlocked,
    "0".repeat(64),
  );
  assert.deepEqual(failures.map(({ code }) => code), [
    "TARGET_CREATOR_IDENTITY_MISMATCH",
    "TARGET_COUNT_RECOVERY_QUARANTINE_GAME_ROWS_MISMATCH",
    "TARGET_COUNT_WORKSPACE_ROWS_MISMATCH",
    "A3_RECOVERY_IDENTITY_MISMATCH",
  ]);
  assert.equal(failures.every(({ observed }) => typeof observed !== "object"), true);

  const malformed = structuredClone(readyResponse) as Record<string, unknown>;
  delete (malformed.integrity as Record<string, unknown>).publicStateTokenValid;
  assert.equal(parseProductionPrivateWorkspaceImportTargetState(malformed, "moi-lab2"), null);
});

async function targetStateResponseFixture(input: {
  payload?: unknown;
  status?: number;
  jsonFailure?: boolean;
  transportFailure?: boolean;
}) {
  let fetchCalls = 0;
  let jsonReads = 0;
  const status = input.status ?? 200;
  const fetcher = (async (request: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1;
    assert.equal(String(request), "/api/admin/sdk-production-private-workspace-import/moi-lab2/target-state");
    assert.deepEqual(init, { method: "GET", cache: "no-store" });
    if (input.transportFailure) throw new Error("transport unavailable");
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        jsonReads += 1;
        if (input.jsonFailure) throw new Error("non-json response");
        return input.payload;
      },
    } as Response;
  }) as typeof fetch;
  const result = await requestProductionPrivateWorkspaceImportTargetState("moi-lab2", fetcher);
  return { result, fetchCalls, jsonReads };
}

test("target-state response contract retains success, known errors, unknown responses, and transport failure", async () => {
  const readyResponse = projectProductionPrivateWorkspaceImportTargetState("moi-lab2", before());
  const success = await targetStateResponseFixture({ payload: readyResponse });
  assert.equal(success.result.kind, "success");
  assert.equal(success.result.kind === "success" && success.result.value.ready, true);
  assert.deepEqual({ fetchCalls: success.fetchCalls, jsonReads: success.jsonReads }, {
    fetchCalls: 1,
    jsonReads: 1,
  });

  const known = await targetStateResponseFixture({
    payload: { error: "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE" },
    status: 503,
  });
  assert.deepEqual(known, {
    result: {
      kind: "http-error",
      status: 503,
      code: "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE",
    },
    fetchCalls: 1,
    jsonReads: 1,
  });

  const unknown = await targetStateResponseFixture({
    payload: { error: "database connection failed: secret detail" },
    status: 503,
  });
  assert.deepEqual(unknown, {
    result: { kind: "http-error", status: 503, code: "SAFE_ERROR_UNAVAILABLE" },
    fetchCalls: 1,
    jsonReads: 1,
  });

  const malformedSuccess = await targetStateResponseFixture({
    payload: { schemaVersion: 1, secret: "must not escape" },
    status: 200,
  });
  assert.deepEqual(malformedSuccess, {
    result: {
      kind: "contract-error",
      status: 200,
      code: "TARGET_STATE_RESPONSE_CONTRACT_INVALID",
    },
    fetchCalls: 1,
    jsonReads: 1,
  });

  const unreadable = await targetStateResponseFixture({ status: 502, jsonFailure: true });
  assert.deepEqual(unreadable, {
    result: { kind: "http-error", status: 502, code: "SAFE_ERROR_UNAVAILABLE" },
    fetchCalls: 1,
    jsonReads: 1,
  });

  const transport = await targetStateResponseFixture({ transportFailure: true });
  assert.deepEqual(transport, {
    result: { kind: "transport-error", code: "TARGET_STATE_TRANSPORT_UNKNOWN" },
    fetchCalls: 1,
    jsonReads: 0,
  });
});

test("target-state HTTP diagnostics retain only exact reachable safe status/code pairs", () => {
  assert.deepEqual(productionPrivateWorkspaceImportTargetStateSafeErrorStatuses, {
    ADMIN_AUTH_REQUIRED: 401,
    ADMIN_FULL_AUTH_REQUIRED: 403,
    ADMIN_STEP_UP_REQUIRED: 403,
    SITE_ADMIN_PASSWORD_NOT_CONFIGURED: 503,
    PRODUCTION_PRIVATE_IMPORT_INPUT_INVALID: 400,
    PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE: 503,
    PRODUCTION_PRIVATE_IMPORT_TARGET_INVALID: 503,
    SDK_ACCOUNT_LINK_SECRET_NOT_CONFIGURED: 503,
    SDK_SERVICE_ENVIRONMENT_MISMATCH: 503,
    SDK_SERVICE_AUTH_REQUIRED: 503,
  });
  assert.deepEqual(parseProductionPrivateWorkspaceImportTargetStateHttpFailure(
    { error: "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE" },
    503,
  ), { status: 503, code: "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE" });
  assert.deepEqual(parseProductionPrivateWorkspaceImportTargetStateHttpFailure(
    { error: "ADMIN_FULL_AUTH_REQUIRED" },
    403,
  ), { status: 403, code: "ADMIN_FULL_AUTH_REQUIRED" });
  assert.deepEqual(parseProductionPrivateWorkspaceImportTargetStateHttpFailure(
    { error: "SDK_SERVICE_AUTH_REQUIRED" },
    503,
  ), { status: 503, code: "SDK_SERVICE_AUTH_REQUIRED" });
  assert.equal(parseProductionPrivateWorkspaceImportTargetStateHttpFailure(
    { error: "database connection failed: secret detail" },
    503,
  ), null);
  assert.equal(parseProductionPrivateWorkspaceImportTargetStateHttpFailure(
    { error: "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE", detail: "unexpected" },
    503,
  ), null);
  assert.equal(parseProductionPrivateWorkspaceImportTargetStateHttpFailure(
    { error: "PRODUCTION_PRIVATE_IMPORT_UNAVAILABLE" },
    409,
  ), null);
  assert.equal(parseProductionPrivateWorkspaceImportTargetStateHttpFailure(
    { error: "PRODUCTION_PRIVATE_IMPORT_OPERATION_CONFLICT" },
    409,
  ), null);
  assert.equal(parseProductionPrivateWorkspaceImportTargetStateHttpFailure(
    { error: "ADMIN_AUTH_REQUIRED" },
    200,
  ), null);
});

async function planResponseFixture(input: {
  payload?: unknown;
  status?: number;
  jsonFailure?: boolean;
  transportFailure?: boolean;
}) {
  const fixture = syntheticBundle();
  const file = new File([fixture.archive], "moi-lab2.bundle.zip", { type: "application/zip" });
  const verification = await verifyProductionPrivateWorkspaceImportFileAgainstSpec(
    file,
    "moi-lab2",
    fixture.specs["moi-lab2"],
  );
  assert.equal(verification.kind, "verified");
  if (verification.kind !== "verified") throw new Error("fixture verification failed");
  const prepared = await prepareProductionPrivateWorkspaceImportPlan({
    target: "moi-lab2",
    archive: fixture.archive,
    specs: fixture.specs,
    adapter: memoryAdapter().adapter,
  });
  let fetchCalls = 0;
  let jsonReads = 0;
  const status = input.status ?? 200;
  const fetcher = (async (request: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1;
    assert.equal(String(request), "/api/admin/sdk-production-private-workspace-import/moi-lab2/plan");
    assert.equal(init?.method, "POST");
    assert.deepEqual(init?.headers, { "Content-Type": "application/zip" });
    assert.equal(init?.body, verification.value.file);
    if (input.transportFailure) throw new Error("transport unavailable");
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        jsonReads += 1;
        if (input.jsonFailure) throw new Error("non-json response");
        return input.payload === undefined ? prepared.response : input.payload;
      },
    } as Response;
  }) as typeof fetch;
  const result = await requestProductionPrivateWorkspaceImportPlan(
    "moi-lab2",
    verification.value,
    fetcher,
  );
  return { result, fetchCalls, jsonReads };
}

test("plan response keeps one POST/read, strict success, safe HTTP diagnostics, and no retry", async () => {
  const success = await planResponseFixture({});
  assert.equal(success.result.kind, "success");
  assert.deepEqual({ fetchCalls: success.fetchCalls, jsonReads: success.jsonReads }, {
    fetchCalls: 1,
    jsonReads: 1,
  });

  const expiredStepUp = await planResponseFixture({
    status: 403,
    payload: { error: "ADMIN_STEP_UP_REQUIRED" },
  });
  assert.deepEqual(expiredStepUp, {
    result: { kind: "http-error", status: 403, code: "ADMIN_STEP_UP_REQUIRED" },
    fetchCalls: 1,
    jsonReads: 1,
  });

  for (const payload of [
    { error: "database connection failed: secret detail" },
    { error: "ADMIN_STEP_UP_REQUIRED", detail: "must not escape" },
  ]) {
    const hidden = await planResponseFixture({ status: 403, payload });
    assert.deepEqual(hidden.result, {
      kind: "http-error",
      status: 403,
      code: "SAFE_ERROR_UNAVAILABLE",
    });
    assert.doesNotMatch(JSON.stringify(hidden.result), /database|secret|detail|must not escape/);
  }

  const wrongStatus = await planResponseFixture({
    status: 503,
    payload: { error: "ADMIN_STEP_UP_REQUIRED" },
  });
  assert.deepEqual(wrongStatus.result, {
    kind: "http-error",
    status: 503,
    code: "SAFE_ERROR_UNAVAILABLE",
  });

  const malformedSuccess = await planResponseFixture({
    status: 200,
    payload: { schemaVersion: 1, secret: "must not escape" },
  });
  assert.deepEqual(malformedSuccess.result, {
    kind: "contract-error",
    status: 200,
    code: "PLAN_RESPONSE_CONTRACT_INVALID",
  });

  const unreadable = await planResponseFixture({ status: 502, jsonFailure: true });
  assert.deepEqual(unreadable, {
    result: { kind: "http-error", status: 502, code: "SAFE_ERROR_UNAVAILABLE" },
    fetchCalls: 1,
    jsonReads: 1,
  });

  const transport = await planResponseFixture({ transportFailure: true });
  assert.deepEqual(transport, {
    result: { kind: "transport-error", code: "PLAN_TRANSPORT_UNKNOWN" },
    fetchCalls: 1,
    jsonReads: 0,
  });
});

test("plan HTTP diagnostics expose only exact reachable status/code pairs", () => {
  assert.deepEqual(parseProductionPrivateWorkspaceImportPlanHttpFailure(
    { error: "ADMIN_STEP_UP_REQUIRED" },
    403,
  ), { status: 403, code: "ADMIN_STEP_UP_REQUIRED" });
  assert.deepEqual(parseProductionPrivateWorkspaceImportPlanHttpFailure(
    { error: "PRODUCTION_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH" },
    400,
  ), { status: 400, code: "PRODUCTION_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH" });
  assert.deepEqual(parseProductionPrivateWorkspaceImportPlanHttpFailure(
    { error: "PRODUCTION_PRIVATE_IMPORT_INVARIANT_UNRESOLVED" },
    409,
  ), { status: 409, code: "PRODUCTION_PRIVATE_IMPORT_INVARIANT_UNRESOLVED" });
  assert.equal(productionPrivateWorkspaceImportPlanSafeErrorStatuses.ADMIN_STEP_UP_REQUIRED, 403);
  assert.equal(parseProductionPrivateWorkspaceImportPlanHttpFailure(
    { error: "PRODUCTION_PRIVATE_IMPORT_INVARIANT_UNRESOLVED" },
    503,
  ), null);
  assert.equal(parseProductionPrivateWorkspaceImportPlanHttpFailure(
    { error: "UNKNOWN_SAFE_LOOKING_CODE" },
    503,
  ), null);
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
  const client = readFileSync("lib/production-private-workspace-import-client.ts", "utf8");
  assert.match(panel, /mode === "preparation"/);
  assert.match(panel, /この画面にはupload、plan、execute controlがありません/);
  assert.match(panel, /planUsed\.current = true/);
  assert.match(panel, /executeUsed\.current = true/);
  assert.match(panel, /execute POSTは再送しません/);
  assert.match(panel, /data-production-private-import-target-failures/);
  assert.match(panel, /setTargetState\(parsed\)/);
  assert.equal((panel.match(/method: "POST"/g) ?? []).length, 1);
  assert.equal((panel.match(/body: verified\.file/g) ?? []).length, 1);
  assert.match(panel, /requestProductionPrivateWorkspaceImportTargetState\("moi-lab2"\)/);
  const targetRead = panel.slice(panel.indexOf("const checkTarget"), panel.indexOf("const requestPlan"));
  assert.match(targetRead, /targetStateUsed\.current = true/);
  assert.match(targetRead, /result\.kind === "transport-error"/);
  assert.match(targetRead, /result\.kind === "http-error"/);
  assert.match(targetRead, /result\.kind === "contract-error"/);
  assert.match(targetRead, /HTTP \$\{result\.status\} \/ \$\{result\.code\}/);
  assert.doesNotMatch(targetRead, /await payload\(response\)/);
  const targetRequest = client.slice(
    client.indexOf("export async function requestProductionPrivateWorkspaceImportTargetState"),
    client.indexOf("export function parseProductionPrivateWorkspaceImportPlan"),
  );
  assert.equal((targetRequest.match(/fetcher\(/g) ?? []).length, 1);
  assert.equal((targetRequest.match(/response\.json\(\)/g) ?? []).length, 1);
  assert.match(targetRequest, /method: "GET", cache: "no-store"/);
  assert.doesNotMatch(targetRequest, /method: "POST"/);
  assert.doesNotMatch(targetRequest, /body:/);

  const planUi = panel.slice(panel.indexOf("const requestPlan"), panel.indexOf("const reconcile"));
  assert.match(planUi, /planUsed\.current = true/);
  assert.match(planUi, /requestProductionPrivateWorkspaceImportPlan\("moi-lab2", verified\)/);
  assert.match(planUi, /result\.kind === "transport-error"/);
  assert.match(planUi, /result\.kind === "http-error" \|\| result\.kind === "contract-error"/);
  assert.match(planUi, /HTTP \$\{result\.status\} \/ \$\{result\.code\}/);
  assert.doesNotMatch(planUi, /fetch\(|await payload\(/);

  const planRequestStart = client.indexOf("export async function requestProductionPrivateWorkspaceImportPlan");
  const planRequest = client.slice(planRequestStart, client.indexOf("function acceptance", planRequestStart));
  assert.equal((planRequest.match(/fetcher\(/g) ?? []).length, 1);
  assert.equal((planRequest.match(/response\.json\(\)/g) ?? []).length, 1);
  assert.match(planRequest, /method: "POST"/);
  assert.match(planRequest, /body: verified\.file/);
});

test("plan authorization stops before body read, SDK transfer, or any import state access", () => {
  const route = readFileSync(
    "app/api/admin/sdk-production-private-workspace-import/[target]/plan/route.ts",
    "utf8",
  );
  const authorization = route.indexOf("await requireRecentSiteAdminMfa()");
  const bodyRead = route.indexOf("await readProductionPrivateWorkspaceImportBody");
  const sdkTransfer = route.indexOf("await fetch(url");
  assert.ok(authorization >= 0);
  assert.ok(bodyRead > authorization);
  assert.ok(sdkTransfer > bodyRead);
  assert.doesNotMatch(route.slice(0, bodyRead), /productionPrivateWorkspaceImportStore|\.insert\(|\.update\(|\.delete\(/);
});
