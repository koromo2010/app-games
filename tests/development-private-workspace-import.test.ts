import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DevelopmentPrivateWorkspaceImportError,
  developmentPrivateWorkspaceImportTargetSpecs,
  executeDevelopmentPrivateWorkspaceImport,
  isDevelopmentPrivateWorkspaceImportTarget,
  prepareDevelopmentPrivateWorkspaceImportPlan,
  readDevelopmentPrivateWorkspaceImportStatus,
  validateDevelopmentPrivateWorkspaceBundle,
  type CompletedDevelopmentPrivateWorkspaceImport,
  type DevelopmentPrivateWorkspaceImportAdapter,
  type DevelopmentPrivateWorkspaceImportBeforeState,
  type DevelopmentPrivateWorkspaceImportTarget,
  type DevelopmentPrivateWorkspaceImportTargetSpec,
} from "../apps/sdk-portal/lib/development-private-workspace-import.ts";
import { createStoredZip } from "../apps/sdk-portal/lib/stored-zip.ts";
import {
  parseDevelopmentPrivateWorkspaceImportExecute,
  parseDevelopmentPrivateWorkspaceImportPlan,
  parseDevelopmentPrivateWorkspaceImportStatus,
} from "../lib/development-private-workspace-import-client.ts";
import { requireDevelopmentPrivateWorkspaceImportPageAccess } from "../lib/development-private-workspace-import-page-access.ts";

const operationA = "11111111-1111-4111-8111-111111111111";
const operationB = "22222222-2222-4222-8222-222222222222";
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const creatorRowId = (target: DevelopmentPrivateWorkspaceImportTarget) => target === "moi-lab2"
  ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const input = value as Record<string, unknown>;
  return `{${Object.keys(input).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(input[key])}`).join(",")}}`;
}

const digest = (value: unknown) => sha256(canonicalJson(value));

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function syntheticBundle(input: {
  target: DevelopmentPrivateWorkspaceImportTarget;
  gameCount: number;
  mutateWorkspace?: (workspace: Record<string, unknown>, index: number) => void;
  mutateLedger?: (ledger: Record<string, unknown>, index: number) => void;
  extraRuntimeFiles?: Array<{ path: string; content: string }>;
}) {
  const gameIds = Array.from({ length: input.gameCount }, (_, index) => `${input.target === "moi-lab2" ? "moi" : "yabo"}-game-${index + 1}`);
  const entries: Array<{ name: string; content: Uint8Array | string }> = [];
  const ledgerGames = gameIds.map((gameId, index) => {
    const smoke = {
      manifestValidation: "PASS",
      clientBoot: "PASS",
      serverInitialization: "NOT_REQUIRED",
      basicInteraction: "PASS",
      statePresentationReconciliation: "PASS",
      requiredAssets: "PASS",
      networkDependency: "NONE",
      blockerCodes: [],
    };
    const revision = String(index + 1).repeat(40);
    const ledger: Record<string, unknown> = {
      target: input.target,
      gameId,
      reconstruction: "READY",
      reconstructionMode: "ARTIFACT_HEAD",
      originalRevision: revision,
      currentOutputSha256: sha256(`output:${gameId}`),
      packageRootSha256: null,
      serverBundleSha256: null,
      appSetSourceSha256: null,
      smoke,
      blockerCodes: [],
    };
    input.mutateLedger?.(ledger, index);
    const workspace: Record<string, unknown> = {
      schemaVersion: 1,
      target: input.target,
      gameId,
      ownerReference: null,
      historicalRestorationClaim: false,
      externalWrites: 0,
      runtimeSmoke: smoke,
      authoringHead: { kind: "mock", revision },
      definitionBackedRebuild: null,
      provenance: { originalRevision: revision, source: "synthetic-test-only" },
    };
    input.mutateWorkspace?.(workspace, index);
    entries.push(
      { name: `games/${gameId}/workspace.json`, content: json(workspace) },
      { name: `games/${gameId}/runtime/index.html`, content: `<!doctype html><title>${index}</title>` },
      { name: `games/${gameId}/runtime/state.json`, content: json({ schemaVersion: 1, state: index }) },
      ...(input.extraRuntimeFiles ?? []).map((file) => ({
        name: `games/${gameId}/runtime/${file.path}`,
        content: file.content,
      })),
    );
    return ledger;
  });
  const ledger = { schemaVersion: 1, target: input.target, games: ledgerGames };
  const ledgerBytes = Buffer.from(json(ledger));
  const manifest = {
    schemaVersion: 1,
    phaseId: "T-131-A4",
    artifactType: "PRIVATE_LOCAL_AUTHORING_WORKSPACE_BUNDLE",
    target: input.target,
    localParent: "98dec9adf87d3876998275b8a70326e8a8214419",
    a0: {
      bytes: 14_375_278,
      sha256: "0919a38bec7dc408f69b1ace799e7901a8ea419bf33fdb8b22bc47e0ac13a9f5",
      sourceMainCommit: "synthetic-test-only",
    },
    creatorRowId: creatorRowId(input.target),
    creatorDisplayName: "synthetic-test-only",
    ownerReference: null,
    gameCount: input.gameCount,
    readyGameCount: input.gameCount,
    blockedGameCount: 0,
    perGameLedgerSha256: sha256(ledgerBytes),
    deferredHistoricalMaterialSha256: sha256("deferred"),
    state: "LOCAL_AUTHORING_WORKSPACE_READY",
    transferAuthorized: false,
    ownerBindingApplied: false,
    releasePublicationApplied: false,
    externalWrites: 0,
  };
  const deferred = {
    schemaVersion: 1,
    target: input.target,
    games: gameIds.map((gameId) => ({ gameId })),
  };
  entries.push(
    { name: "workspace-manifest.json", content: json(manifest) },
    { name: "per-game-ledger.json", content: ledgerBytes },
    { name: "deferred-historical-material.json", content: json(deferred) },
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
  })).sort((left, right) => String(left.gameId).localeCompare(String(right.gameId)));
  const spec: DevelopmentPrivateWorkspaceImportTargetSpec = {
    target: input.target,
    bundleBytes: archive.byteLength,
    bundleSha256: sha256(archive),
    gameCount: input.gameCount,
    gameIdentitySetSha256: digest([...gameIds].sort()),
    perGameIdentitySha256: digest(identities),
  };
  return { archive, spec };
}

function specsFor(
  moi: DevelopmentPrivateWorkspaceImportTargetSpec,
  yabo: DevelopmentPrivateWorkspaceImportTargetSpec,
) {
  return { "moi-lab2": moi, "yabobojpn-lab": yabo } as const;
}

function before(target: DevelopmentPrivateWorkspaceImportTarget): DevelopmentPrivateWorkspaceImportBeforeState {
  return {
    targetCreatorRowId: creatorRowId(target),
    targetCreatorRows: 1,
    targetDeletedCreatorRows: 1,
    targetCreatorOwnerRows: 0,
    targetGameRows: target === "moi-lab2" ? 2 : 5,
    targetDeletedGameRows: target === "moi-lab2" ? 2 : 5,
    targetActiveGameRows: 0,
    targetReleaseRows: 0,
    targetCurrentReleaseRows: 0,
    targetWorkspaceRows: 0,
    targetWorkspaceGameRows: 0,
    targetWorkspaceFileRows: 0,
    sourceStateToken: sha256(`source:${target}`),
    publicStateToken: sha256("public"),
    unrelatedPrivateStateToken: sha256(`unrelated:${target}`),
  };
}

function memoryAdapter() {
  const states = new Map<DevelopmentPrivateWorkspaceImportTarget, DevelopmentPrivateWorkspaceImportBeforeState>([
    ["moi-lab2", before("moi-lab2")],
    ["yabobojpn-lab", before("yabobojpn-lab")],
  ]);
  const completed = new Map<string, CompletedDevelopmentPrivateWorkspaceImport>();
  const effects = {
    publicState: { grants: 0, releases: 0, publications: 0, aliases: 0, rooms: 0 },
    targetWrites: new Map<DevelopmentPrivateWorkspaceImportTarget, number>(),
  };
  const adapter: DevelopmentPrivateWorkspaceImportAdapter = {
    readBeforeState: async (target) => ({ ...states.get(target)! }),
    readCompletedOperation: async (operationId) => completed.get(operationId) ?? null,
    importAtomic: async (input) => {
      const current = states.get(input.bundle.target)!;
      if (canonicalJson(current) !== canonicalJson(input.beforeState)) {
        throw new DevelopmentPrivateWorkspaceImportError("DEVELOPMENT_PRIVATE_IMPORT_CONCURRENT_CHANGE");
      }
      const prior = completed.get(input.operationId);
      if (prior) {
        if (prior.target !== input.bundle.target || prior.planReceipt !== input.planReceipt) {
          throw new DevelopmentPrivateWorkspaceImportError("DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT");
        }
        return { replayed: true, readBack: prior.readBack };
      }
      const snapshot = { state: { ...current }, targetWrites: effects.targetWrites.get(input.bundle.target) ?? 0 };
      try {
        if (input.faultAt) throw new Error(input.faultAt);
        states.set(input.bundle.target, {
          ...current,
          targetWorkspaceRows: 1,
          targetWorkspaceGameRows: input.bundle.gameCount,
          targetWorkspaceFileRows: input.bundle.runtimeFileCount,
        });
        effects.targetWrites.set(input.bundle.target, snapshot.targetWrites + 1);
        const result: CompletedDevelopmentPrivateWorkspaceImport = {
          target: input.bundle.target,
          operationId: input.operationId,
          planReceipt: input.planReceipt,
          bundleSha256: input.bundle.bundleSha256,
          readBack: input.expectedReadBack,
        };
        completed.set(input.operationId, result);
        return { replayed: false, readBack: input.expectedReadBack };
      } catch (error) {
        states.set(input.bundle.target, snapshot.state);
        effects.targetWrites.set(input.bundle.target, snapshot.targetWrites);
        completed.delete(input.operationId);
        throw error;
      }
    },
  };
  return { adapter, states, completed, effects };
}

function code(error: unknown) {
  assert.ok(error instanceof DevelopmentPrivateWorkspaceImportError);
  return error.code;
}

test("the recovery contract admits exactly two target-specific bundle identities", () => {
  assert.deepEqual(Object.keys(developmentPrivateWorkspaceImportTargetSpecs), ["moi-lab2", "yabobojpn-lab"]);
  assert.equal(isDevelopmentPrivateWorkspaceImportTarget("moi-lab2"), true);
  assert.equal(isDevelopmentPrivateWorkspaceImportTarget("yabobojpn-lab"), true);
  assert.equal(isDevelopmentPrivateWorkspaceImportTarget("yabobo"), false);
  assert.equal(developmentPrivateWorkspaceImportTargetSpecs["moi-lab2"].gameCount, 2);
  assert.equal(developmentPrivateWorkspaceImportTargetSpecs["yabobojpn-lab"].gameCount, 5);
});

test("independent plan and execute operations import both synthetic targets privately", async () => {
  const moi = syntheticBundle({ target: "moi-lab2", gameCount: 2 });
  const yabo = syntheticBundle({ target: "yabobojpn-lab", gameCount: 5 });
  const specs = specsFor(moi.spec, yabo.spec);
  const state = memoryAdapter();
  const moiPlan = await prepareDevelopmentPrivateWorkspaceImportPlan({
    target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter,
  });
  const yaboPlan = await prepareDevelopmentPrivateWorkspaceImportPlan({
    target: "yabobojpn-lab", archive: yabo.archive, specs, adapter: state.adapter,
  });
  assert.notEqual(moiPlan.response.planReceipt, yaboPlan.response.planReceipt);
  assert.equal(moiPlan.response.writesPerformed, 0);
  assert.equal(yaboPlan.response.writesPerformed, 0);
  const moiResult = await executeDevelopmentPrivateWorkspaceImport({
    target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter,
    identity: { operationId: operationA, planReceipt: moiPlan.response.planReceipt },
  });
  const yaboResult = await executeDevelopmentPrivateWorkspaceImport({
    target: "yabobojpn-lab", archive: yabo.archive, specs, adapter: state.adapter,
    identity: { operationId: operationB, planReceipt: yaboPlan.response.planReceipt },
  });
  assert.equal(moiResult.imported.gameRows, 2);
  assert.equal(yaboResult.imported.gameRows, 5);
  assert.equal(moiResult.visibility, "private-quarantined");
  assert.equal(yaboResult.ownerBinding, "unbound");
  assert.deepEqual(state.effects.publicState, { grants: 0, releases: 0, publications: 0, aliases: 0, rooms: 0 });
  assert.equal(state.effects.targetWrites.get("moi-lab2"), 1);
  assert.equal(state.effects.targetWrites.get("yabobojpn-lab"), 1);
});

test("read-only status binds target, bundle, receipt and actual acceptance identity", async () => {
  const moi = syntheticBundle({ target: "moi-lab2", gameCount: 2 });
  const yabo = syntheticBundle({ target: "yabobojpn-lab", gameCount: 5 });
  const specs = specsFor(moi.spec, yabo.spec);
  const state = memoryAdapter();
  const plan = await prepareDevelopmentPrivateWorkspaceImportPlan({
    target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter,
  });
  const identity = {
    operationId: operationA,
    planReceipt: plan.response.planReceipt,
    bundleSha256: moi.spec.bundleSha256,
  };
  const notFound = await readDevelopmentPrivateWorkspaceImportStatus({
    target: "moi-lab2", identity, specs, adapter: state.adapter,
  });
  assert.deepEqual(notFound, {
    schemaVersion: 1,
    environment: "development",
    target: "moi-lab2",
    phase: "status",
    operationId: operationA,
    state: "not-found",
    acceptance: null,
  });
  await executeDevelopmentPrivateWorkspaceImport({
    target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter,
    identity: { operationId: operationA, planReceipt: plan.response.planReceipt },
  });
  const completed = await readDevelopmentPrivateWorkspaceImportStatus({
    target: "moi-lab2", identity, specs, adapter: state.adapter,
  });
  assert.equal(completed.state, "completed");
  assert.equal(completed.acceptance?.workspaceId, operationA);
  assert.equal(completed.acceptance?.gameRows, 2);
  assert.equal(completed.acceptance?.private, true);
  assert.equal(completed.acceptance?.quarantined, true);
  assert.equal(completed.acceptance?.ownerBinding, "unbound");
  assert.equal(completed.acceptance?.grants, 0);
  assert.match(completed.acceptance?.statusReceipt ?? "", /^[0-9a-f]{64}$/);
  await assert.rejects(readDevelopmentPrivateWorkspaceImportStatus({
    target: "moi-lab2",
    identity: { ...identity, planReceipt: sha256("substituted") },
    specs,
    adapter: state.adapter,
  }), (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT");
  await assert.rejects(readDevelopmentPrivateWorkspaceImportStatus({
    target: "yabobojpn-lab",
    identity: { operationId: operationA, planReceipt: plan.response.planReceipt, bundleSha256: yabo.spec.bundleSha256 },
    specs,
    adapter: state.adapter,
  }), (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT");
  state.completed.get(operationA)!.readBack.grantRows = 1 as 0;
  await assert.rejects(readDevelopmentPrivateWorkspaceImportStatus({
    target: "moi-lab2", identity, specs, adapter: state.adapter,
  }), (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_CONCURRENT_CHANGE");
});

test("target and receipt substitution fail before any target write", async () => {
  const moi = syntheticBundle({ target: "moi-lab2", gameCount: 2 });
  const yabo = syntheticBundle({ target: "yabobojpn-lab", gameCount: 5 });
  const specs = specsFor(moi.spec, yabo.spec);
  const state = memoryAdapter();
  assert.throws(
    () => validateDevelopmentPrivateWorkspaceBundle({ target: "yabobojpn-lab", archive: moi.archive, specs }),
    (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_BUNDLE_IDENTITY_MISMATCH",
  );
  const moiPlan = await prepareDevelopmentPrivateWorkspaceImportPlan({ target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter });
  const yaboPlan = await prepareDevelopmentPrivateWorkspaceImportPlan({ target: "yabobojpn-lab", archive: yabo.archive, specs, adapter: state.adapter });
  await assert.rejects(executeDevelopmentPrivateWorkspaceImport({
    target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter,
    identity: { operationId: operationA, planReceipt: yaboPlan.response.planReceipt },
  }), (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_PLAN_RECEIPT_MISMATCH");
  assert.equal(state.effects.targetWrites.size, 0);
  assert.notEqual(moiPlan.response.planReceipt, yaboPlan.response.planReceipt);
});

test("completed replay and cross-target operation reuse both fail closed", async () => {
  const moi = syntheticBundle({ target: "moi-lab2", gameCount: 2 });
  const yabo = syntheticBundle({ target: "yabobojpn-lab", gameCount: 5 });
  const specs = specsFor(moi.spec, yabo.spec);
  const state = memoryAdapter();
  const plan = await prepareDevelopmentPrivateWorkspaceImportPlan({ target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter });
  const identity = { operationId: operationA, planReceipt: plan.response.planReceipt };
  const first = await executeDevelopmentPrivateWorkspaceImport({ target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter, identity });
  assert.equal(first.replayed, false);
  await assert.rejects(executeDevelopmentPrivateWorkspaceImport({
    target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter, identity,
  }), (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT");
  assert.equal(state.effects.targetWrites.get("moi-lab2"), 1);
  await assert.rejects(executeDevelopmentPrivateWorkspaceImport({
    target: "yabobojpn-lab", archive: yabo.archive, specs, adapter: state.adapter,
    identity: { operationId: operationA, planReceipt: plan.response.planReceipt },
  }), (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_OPERATION_CONFLICT");
});

test("concurrent before-state changes fail closed", async () => {
  const moi = syntheticBundle({ target: "moi-lab2", gameCount: 2 });
  const yabo = syntheticBundle({ target: "yabobojpn-lab", gameCount: 5 });
  const specs = specsFor(moi.spec, yabo.spec);
  const state = memoryAdapter();
  const plan = await prepareDevelopmentPrivateWorkspaceImportPlan({ target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter });
  state.states.get("moi-lab2")!.sourceStateToken = sha256("concurrent-change");
  await assert.rejects(executeDevelopmentPrivateWorkspaceImport({
    target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter,
    identity: { operationId: operationA, planReceipt: plan.response.planReceipt },
  }), (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_PLAN_RECEIPT_MISMATCH");
  assert.equal(state.effects.targetWrites.size, 0);
});

test("every partial-failure point rolls back the entire synthetic operation", async () => {
  const moi = syntheticBundle({ target: "moi-lab2", gameCount: 2 });
  const yabo = syntheticBundle({ target: "yabobojpn-lab", gameCount: 5 });
  const specs = specsFor(moi.spec, yabo.spec);
  for (const faultAt of ["before-ledger", "after-ledger", "after-workspace", "after-games", "after-files", "before-terminal"] as const) {
    const state = memoryAdapter();
    const initial = { ...state.states.get("moi-lab2")! };
    const plan = await prepareDevelopmentPrivateWorkspaceImportPlan({ target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter });
    await assert.rejects(executeDevelopmentPrivateWorkspaceImport({
      target: "moi-lab2", archive: moi.archive, specs, adapter: state.adapter, faultAt,
      identity: { operationId: operationA, planReceipt: plan.response.planReceipt },
    }));
    assert.deepEqual(state.states.get("moi-lab2"), initial);
    assert.equal(state.completed.size, 0);
    assert.equal(state.effects.targetWrites.get("moi-lab2") ?? 0, 0);
  }
});

function replaceAllExact(archive: Buffer, from: string, to: string) {
  assert.equal(Buffer.byteLength(from), Buffer.byteLength(to));
  const copy = Buffer.from(archive);
  let offset = 0;
  let replacements = 0;
  for (;;) {
    const found = copy.indexOf(from, offset, "utf8");
    if (found < 0) break;
    copy.write(to, found, "utf8");
    offset = found + Buffer.byteLength(to);
    replacements += 1;
  }
  assert.equal(replacements > 0 && replacements % 2 === 0, true);
  return copy;
}

test("archive traversal, normalized duplicates, special entries and limits fail closed", () => {
  const moi = syntheticBundle({
    target: "moi-lab2", gameCount: 2,
    extraRuntimeFiles: [{ path: "extra-a.js", content: "a" }, { path: "extra-b.js", content: "b" }],
  });
  const yabo = syntheticBundle({ target: "yabobojpn-lab", gameCount: 5 });
  const withSpec = (archive: Buffer) => specsFor({ ...moi.spec, bundleBytes: archive.byteLength, bundleSha256: sha256(archive) }, yabo.spec);

  const traversal = replaceAllExact(moi.archive, "extra-a.js", "../bad.js?");
  assert.throws(
    () => validateDevelopmentPrivateWorkspaceBundle({ target: "moi-lab2", archive: traversal, specs: withSpec(traversal) }),
    (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_INVALID",
  );

  const duplicate = replaceAllExact(moi.archive, "extra-b.js", "EXTRA-A.JS");
  assert.throws(
    () => validateDevelopmentPrivateWorkspaceBundle({ target: "moi-lab2", archive: duplicate, specs: withSpec(duplicate) }),
    (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_INVALID",
  );

  const special = Buffer.from(moi.archive);
  const end = special.length - 22;
  const directory = special.readUInt32LE(end + 16);
  special.writeUInt32LE(0xa0000000, directory + 38);
  assert.throws(
    () => validateDevelopmentPrivateWorkspaceBundle({ target: "moi-lab2", archive: special, specs: withSpec(special) }),
    (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_ARCHIVE_SPECIAL_ENTRY",
  );

  const oversized = syntheticBundle({
    target: "moi-lab2", gameCount: 2,
    extraRuntimeFiles: [{ path: "large.js", content: "x".repeat(1_100_000) }],
  });
  assert.throws(
    () => validateDevelopmentPrivateWorkspaceBundle({
      target: "moi-lab2", archive: oversized.archive,
      specs: specsFor(oversized.spec, yabo.spec),
    }),
    (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_LIMIT_EXCEEDED",
  );
});

test("cross-target workspace rows, non-READY games and owner guesses are rejected", () => {
  const yabo = syntheticBundle({ target: "yabobojpn-lab", gameCount: 5 });
  for (const moi of [
    syntheticBundle({ target: "moi-lab2", gameCount: 2, mutateWorkspace: (workspace, index) => { if (index === 0) workspace.target = "yabobojpn-lab"; } }),
    syntheticBundle({ target: "moi-lab2", gameCount: 2, mutateWorkspace: (workspace, index) => { if (index === 0) workspace.ownerReference = "guessed-owner"; } }),
    syntheticBundle({ target: "moi-lab2", gameCount: 2, mutateLedger: (ledger, index) => { if (index === 0) ledger.reconstruction = "BLOCKED"; } }),
  ]) {
    assert.throws(
      () => validateDevelopmentPrivateWorkspaceBundle({ target: "moi-lab2", archive: moi.archive, specs: specsFor(moi.spec, yabo.spec) }),
      (error) => code(error) === "DEVELOPMENT_PRIVATE_IMPORT_CONTENT_INVALID",
    );
  }
});

test("browser projections accept only exact write-free plan, execute and status contracts", () => {
  const target = "moi-lab2" as const;
  const spec = developmentPrivateWorkspaceImportTargetSpecs[target];
  const contentSetSha256 = "a".repeat(64);
  const planReceipt = "b".repeat(64);
  const plan = parseDevelopmentPrivateWorkspaceImportPlan({
    schemaVersion: 1,
    environment: "development",
    target,
    phase: "plan",
    writesPerformed: 0,
    bundle: {
      bytes: spec.bundleBytes,
      sha256: spec.bundleSha256,
      schemaVersion: 1,
      gameCount: spec.gameCount,
      gameIdentitySetSha256: spec.gameIdentitySetSha256,
      perGameIdentitySha256: spec.perGameIdentitySha256,
      contentSetSha256,
    },
    intendedMutations: {
      privateWorkspaceRows: 1,
      privateGameRows: 2,
      privateFileRows: 9,
      visibility: "private-quarantined",
      ownerBinding: "unbound",
      grants: 0,
      releases: 0,
      publications: 0,
      aliases: 0,
      rooms: 0,
    },
    beforeStateSha256: "c".repeat(64),
    planReceipt,
  }, target);
  assert.equal(plan?.writesPerformed, 0);
  assert.equal(plan?.planReceipt, planReceipt);
  assert.equal(parseDevelopmentPrivateWorkspaceImportPlan({ ...plan, writesPerformed: 1 }, target), null);

  const terminal = parseDevelopmentPrivateWorkspaceImportExecute({
    schemaVersion: 1,
    environment: "development",
    target,
    phase: "execute",
    operationId: operationA,
    state: "completed",
    visibility: "private-quarantined",
    ownerBinding: "unbound",
    logicalWrites: 1,
    replayed: false,
    bundle: {
      bytes: spec.bundleBytes,
      sha256: spec.bundleSha256,
      schemaVersion: 1,
      gameCount: spec.gameCount,
      gameIdentitySetSha256: spec.gameIdentitySetSha256,
      perGameIdentitySha256: spec.perGameIdentitySha256,
      contentSetSha256,
    },
    imported: { workspaceRows: 1, gameRows: 2, fileRows: 9 },
    nonEffects: {
      unrelatedTarget: "byte-for-byte-unchanged",
      sourceWorkspace: "row-for-row-unchanged",
      grants: 0,
      releases: 0,
      publications: 0,
      aliases: 0,
      rooms: 0,
    },
    readBackSha256: "d".repeat(64),
    terminalReceipt: "e".repeat(64),
  }, target, operationA);
  assert.equal(terminal?.logicalWrites, 1);
  assert.equal(terminal?.acceptance.ownerBinding, "unbound");
  assert.equal(parseDevelopmentPrivateWorkspaceImportExecute({
    schemaVersion: 1,
    environment: "development",
    target,
    phase: "execute",
    operationId: operationA,
    state: "completed",
    visibility: "private-quarantined",
    ownerBinding: "unbound",
    logicalWrites: 0,
    replayed: true,
    bundle: {
      bytes: spec.bundleBytes,
      sha256: spec.bundleSha256,
      schemaVersion: 1,
      gameCount: spec.gameCount,
      gameIdentitySetSha256: spec.gameIdentitySetSha256,
      perGameIdentitySha256: spec.perGameIdentitySha256,
      contentSetSha256,
    },
    imported: { workspaceRows: 1, gameRows: 2, fileRows: 9 },
    nonEffects: {
      unrelatedTarget: "byte-for-byte-unchanged",
      sourceWorkspace: "row-for-row-unchanged",
      grants: 0,
      releases: 0,
      publications: 0,
      aliases: 0,
      rooms: 0,
    },
    readBackSha256: "d".repeat(64),
    terminalReceipt: "e".repeat(64),
  }, target, operationA), null);

  const acceptance = {
    ...terminal!.acceptance,
    statusReceipt: "f".repeat(64),
  };
  const status = parseDevelopmentPrivateWorkspaceImportStatus({
    schemaVersion: 1,
    environment: "development",
    target,
    phase: "status",
    operationId: operationA,
    state: "completed",
    acceptance,
  }, target, operationA);
  assert.equal(status?.state, "completed");
  assert.equal(parseDevelopmentPrivateWorkspaceImportStatus({
    schemaVersion: 1,
    environment: "development",
    target: "yabobojpn-lab",
    phase: "status",
    operationId: operationA,
    state: "completed",
    acceptance,
  }, target, operationA), null);
  assert.equal(parseDevelopmentPrivateWorkspaceImportStatus({
    schemaVersion: 1,
    environment: "development",
    target,
    phase: "status",
    operationId: operationA,
    state: "completed",
    acceptance: { ...acceptance, grants: 1 },
  }, target, operationA), null);
});

test("operator page requires canonical Development, full session and explicit recent MFA", async () => {
  const runtimeIdentity = () => ({
    semanticEnvironment: "development",
    vercelEnvironment: "production",
    project: "app-games-dev",
    ref: "develop",
  });
  assert.equal(await requireDevelopmentPrivateWorkspaceImportPageAccess({
    runtimeIdentity,
    requireFullSession: async () => ({ recentMfa: true }),
  }), "ready");
  assert.equal(await requireDevelopmentPrivateWorkspaceImportPageAccess({
    runtimeIdentity,
    requireFullSession: async () => ({ recentMfa: false }),
  }), "step-up-required");
  await assert.rejects(requireDevelopmentPrivateWorkspaceImportPageAccess({
    runtimeIdentity: () => ({ ...runtimeIdentity(), project: "app-games" }),
    requireFullSession: async () => ({ recentMfa: true }),
  }), /DEVELOPMENT_RUNTIME_REQUIRED/);
  await assert.rejects(requireDevelopmentPrivateWorkspaceImportPageAccess({
    runtimeIdentity,
    requireFullSession: async () => { throw new Error("SITE_ADMIN_FULL_AUTH_REQUIRED"); },
  }), /SITE_ADMIN_FULL_AUTH_REQUIRED/);
});

test("source boundary is Development-only, MFA-gated, serializable and has no public mutation path", () => {
  const paths = [
    "apps/sdk-portal/lib/development-private-workspace-import-store.ts",
    "apps/sdk-portal/app/api/internal/recovery/development-private-workspace-import/[target]/plan/route.ts",
    "apps/sdk-portal/app/api/internal/recovery/development-private-workspace-import/[target]/execute/route.ts",
    "apps/sdk-portal/app/api/internal/recovery/development-private-workspace-import/[target]/status/[operationId]/route.ts",
    "app/api/admin/sdk-development-private-workspace-import/[target]/plan/route.ts",
    "app/api/admin/sdk-development-private-workspace-import/[target]/execute/route.ts",
    "app/api/admin/sdk-development-private-workspace-import/[target]/status/[operationId]/route.ts",
  ];
  const source = paths.map((path) => readFileSync(path, "utf8")).join("\n");
  const panel = readFileSync(
    "app/site-admin/runtime-operations/development-private-workspace-import/[target]/DevelopmentPrivateWorkspaceImportPanel.tsx",
    "utf8",
  );
  const targetPage = readFileSync(
    "app/site-admin/runtime-operations/development-private-workspace-import/[target]/page.tsx",
    "utf8",
  );
  const adminPanel = readFileSync("app/admin/SiteAdminPanel.tsx", "utf8");
  const store = readFileSync("apps/sdk-portal/lib/development-private-workspace-import-store.ts", "utf8");
  const migration = readFileSync("db/sdk/011_development_private_workspace_import.sql", "utf8");
  assert.match(source, /expectedEnvironment: "development"/);
  assert.match(source, /sdkSupportEnvironment\(\) !== "development"/);
  assert.match(source, /requireRecentSiteAdminMfa/);
  assert.match(source, /requireFullSiteAdminSession/);
  assert.match(source, /isCanonicalDevelopmentPlatformRuntime/);
  assert.match(source, /isolationLevel: "Serializable"/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.doesNotMatch(source, /expectedEnvironment: "production"/);
  assert.doesNotMatch(source, /INSERT INTO sdk_(?:creators|games|app_releases|oauth_grants|release_decisions)\b/i);
  assert.doesNotMatch(source, /UPDATE sdk_(?:creators|games|app_releases|oauth_grants|release_decisions)\b/i);
  assert.match(migration, /visibility = 'private-quarantined'/);
  assert.match(migration, /owner_binding_state = 'unbound'/);
  assert.match(migration, /historical_restoration_claim = FALSE/);
  assert.doesNotMatch(migration, /REFERENCES sdk_(?:creators|games|app_releases|oauth_grants)/i);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
  assert.match(store, /game_rows\.game_rows = o\.game_count/);
  assert.match(store, /file_rows\.file_rows = o\.runtime_file_count/);
  assert.match(store, /file_rows\.exact_file_rows = o\.runtime_file_count/);
  assert.match(panel, /crypto\.subtle|verifyDevelopmentPrivateWorkspaceImportFile/);
  assert.match(panel, /planUsed\.current = true/);
  assert.match(panel, /executeUsed\.current = true/);
  assert.match(panel, /method: "GET"/);
  assert.match(panel, /execute POSTは再送しません/);
  assert.match(panel, /同じFile object、固定operation ID、表示済みreceipt/);
  assert.doesNotMatch(panel, /localStorage|sessionStorage|console\./);
  assert.match(targetPage, /requireDevelopmentPrivateWorkspaceImportPageAccess/);
  assert.match(targetPage, /planやimportは自動実行されません|DevelopmentPrivateWorkspaceImportPanel/);
  assert.match(adminPanel, />Private import<\/Link>/);
});
