import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  artifactReconstructionBlocked,
  assertCreatorRecoveryPreconditions,
  createCreatorRecoveryPlan,
  createCreatorRecoveryTerminalReceipt,
  CreatorRecoveryError,
  creatorRowQuarantineTargets,
  isCreatorRowQuarantineTarget,
  parseCreatorRecoveryWriteRequest,
  processCreatorRecoveryDryRun,
  processCreatorRecoveryWrite,
  rejectArtifactBackedReconstruction,
  type CreatorRecoverySnapshot,
  type CreatorRowQuarantineTarget,
} from "../apps/sdk-portal/lib/creator-quarantine-recovery.ts";

const operationId = "11111111-1111-4111-8111-111111111111";
const otherOperationId = "22222222-2222-4222-8222-222222222222";

function snapshot(overrides: Partial<CreatorRecoverySnapshot> = {}): CreatorRecoverySnapshot {
  return {
    creatorRows: 1,
    deletedCreatorRows: 1,
    ownerBoundRows: 0,
    tombstonedGameRows: 0,
    activeGameRows: 0,
    packageRevisionRows: 0,
    releaseRows: 0,
    currentReleaseRows: 0,
    dbVersionToken: "a".repeat(64),
    ...overrides,
  };
}

function code(error: unknown) {
  assert.ok(error instanceof CreatorRecoveryError);
  return error.code;
}

function fakeAdapter(target: CreatorRowQuarantineTarget) {
  const prepared = createCreatorRecoveryPlan(target, "production", snapshot());
  let operation: { id: string; receipt: string } | null = null;
  let writes = 0;
  return {
    state: () => ({ operation: operation ? { ...operation } : null, writes }),
    adapter: {
      readPlan: async () => prepared,
      quarantine: async (input: {
        operationId: string;
        planReceipt: string;
        concurrencyToken: string;
        faultAt?: "before-ledger" | "after-ledger" | "after-quarantine-items" | "before-terminal";
      }) => {
        if (operation && operation.id !== input.operationId) {
          throw new CreatorRecoveryError("CREATOR_RECOVERY_OPERATION_CONFLICT");
        }
        if (operation) return createCreatorRecoveryTerminalReceipt({
          target, environment: "production", operationId: operation.id,
          planReceipt: operation.receipt, replayed: true,
        });
        const before = { operation, writes };
        try {
          if (input.faultAt) throw new Error("injected");
          operation = { id: input.operationId, receipt: input.planReceipt };
          writes += 1;
          return createCreatorRecoveryTerminalReceipt({
            target, environment: "production", operationId: input.operationId,
            planReceipt: input.planReceipt, replayed: false,
          });
        } catch (error) {
          operation = before.operation;
          writes = before.writes;
          throw error;
        }
      },
    },
    plan: prepared.response,
  };
}

test("only the two compile-time targets are eligible and neither is request-selected", () => {
  assert.deepEqual(creatorRowQuarantineTargets, ["moi-lab2", "yabobojpn-lab"]);
  assert.equal(isCreatorRowQuarantineTarget("moi-lab2"), true);
  assert.equal(isCreatorRowQuarantineTarget("yabobojpn-lab"), true);
  assert.equal(isCreatorRowQuarantineTarget("third-target"), false);
  for (const input of [
    {}, { slug: "moi-lab2" }, { target: "moi-lab2", operationId, planReceipt: "b".repeat(64) },
    { operationId, planReceipt: "short" }, { operationId, planReceipt: "b".repeat(64), dryRun: false },
  ]) {
    assert.throws(() => parseCreatorRecoveryWriteRequest(input), (error) => code(error) === "CREATOR_RECOVERY_INPUT_INVALID");
  }
});

test("row quarantine rejects non-quarantine source state without fixed historical inventory", () => {
  assert.doesNotThrow(() => assertCreatorRecoveryPreconditions(snapshot({ tombstonedGameRows: 0, packageRevisionRows: 0 })));
  for (const input of [
    snapshot({ creatorRows: 0 }), snapshot({ deletedCreatorRows: 0 }), snapshot({ ownerBoundRows: 1 }),
    snapshot({ activeGameRows: 1 }), snapshot({ releaseRows: 1 }), snapshot({ currentReleaseRows: 1 }),
    snapshot({ dbVersionToken: "invalid" }),
  ]) {
    assert.throws(() => assertCreatorRecoveryPreconditions(input), (error) => code(error) === "CREATOR_RECOVERY_PRECONDITION_FAILED");
  }
});

test("target plans and receipts are independent and artifact reconstruction stays blocked", async () => {
  const moi = fakeAdapter("moi-lab2");
  const yabo = fakeAdapter("yabobojpn-lab");
  assert.notEqual(moi.plan.planReceipt, yabo.plan.planReceipt);
  assert.equal(moi.plan.artifactRecovery, artifactReconstructionBlocked);
  assert.equal((await processCreatorRecoveryDryRun(moi.adapter)).writesPerformed, 0);
  assert.equal(moi.state().writes, 0);
  assert.throws(() => rejectArtifactBackedReconstruction(), (error) => code(error) === "CREATOR_RECOVERY_ARTIFACT_RECONSTRUCTION_BLOCKED");
});

test("write receipt is target-bound, idempotent, and cannot continue across targets", async () => {
  const moi = fakeAdapter("moi-lab2");
  const yabo = fakeAdapter("yabobojpn-lab");
  await assert.rejects(processCreatorRecoveryWrite({ operationId, planReceipt: yabo.plan.planReceipt }, moi.adapter), (error) => code(error) === "CREATOR_RECOVERY_PLAN_RECEIPT_MISMATCH");
  const first = await processCreatorRecoveryWrite({ operationId, planReceipt: moi.plan.planReceipt }, moi.adapter);
  const replay = await processCreatorRecoveryWrite({ operationId, planReceipt: moi.plan.planReceipt }, moi.adapter);
  assert.equal(first.state, "quarantined");
  assert.equal(first.visibility, "non-public");
  assert.equal(first.ownerBinding, "unbound");
  assert.equal(first.grantState, "absent");
  assert.equal(first.releaseState, "blocked");
  assert.equal(first.publication, "blocked");
  assert.equal(first.artifactRecovery, artifactReconstructionBlocked);
  assert.equal(replay.replayed, true);
  assert.equal(moi.state().writes, 1);
  assert.equal(yabo.state().writes, 0);
  await assert.rejects(processCreatorRecoveryWrite({ operationId: otherOperationId, planReceipt: moi.plan.planReceipt }, moi.adapter), (error) => code(error) === "CREATOR_RECOVERY_OPERATION_CONFLICT");
});

test("fault injection rolls back the local target operation", async () => {
  for (const faultAt of ["before-ledger", "after-ledger", "after-quarantine-items", "before-terminal"] as const) {
    const target = fakeAdapter("moi-lab2");
    await assert.rejects(processCreatorRecoveryWrite({ operationId, planReceipt: target.plan.planReceipt }, target.adapter, { faultAt }));
    assert.deepEqual(target.state(), { operation: null, writes: 0 });
  }
});

test("source routes are production POST-only, path-bound, recent-MFA-gated and migration-free", () => {
  const source = [
    "apps/sdk-portal/lib/creator-quarantine-recovery-store.ts",
    "apps/sdk-portal/app/api/internal/recovery/creator-quarantine/[target]/dry-run/route.ts",
    "apps/sdk-portal/app/api/internal/recovery/creator-quarantine/[target]/execute/route.ts",
    "app/api/admin/sdk-creator-quarantine-recovery/[target]/dry-run/route.ts",
    "app/api/admin/sdk-creator-quarantine-recovery/[target]/execute/route.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  const migration = readFileSync("db/sdk/010_bounded_creator_quarantine_recovery.sql", "utf8");
  assert.match(source, /target_key/);
  assert.match(source, /isolationLevel: "Serializable"/);
  assert.ok((source.match(/FOR UPDATE/g) ?? []).length >= 4);
  assert.match(source, /requireSdkServiceRequest/);
  assert.match(source, /requireRecentSiteAdminMfa/);
  assert.match(source, /expectedEnvironment: "production"/);
  assert.doesNotMatch(source, /ensureSdkSchema|GET\(/);
  assert.doesNotMatch(source, /INSERT INTO sdk_(?:creators|games)\b|UPDATE sdk_(?:creators|games)\b/i);
  assert.doesNotMatch(source, /moi-lab2.*yabobojpn-lab.*batch/i);
  assert.match(migration, /target_key/);
  assert.doesNotMatch(migration, /moi-lab2|yabobojpn-lab|\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
  assert.equal(existsSync("db/sdk/011_bounded_creator_quarantine_recovery.sql"), false);
});
