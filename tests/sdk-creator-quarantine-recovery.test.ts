import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertCreatorRecoveryPreconditions,
  createCreatorRecoveryPlan,
  createCreatorRecoveryTerminalReceipt,
  CreatorRecoveryError,
  parseCreatorRecoveryRequest,
  processCreatorRecoveryRequest,
  type CreatorRecoveryFaultPoint,
  type CreatorRecoverySnapshot,
} from "../apps/sdk-portal/lib/creator-quarantine-recovery.ts";

const operationId = "11111111-1111-4111-8111-111111111111";
const otherOperationId = "22222222-2222-4222-8222-222222222222";

function snapshot(
  overrides: Omit<Partial<CreatorRecoverySnapshot>, "counts"> & {
    counts?: Partial<CreatorRecoverySnapshot["counts"]>;
  } = {},
): CreatorRecoverySnapshot {
  return {
    creatorLifecycle: overrides.creatorLifecycle ?? "deleted",
    ownerAuthority: overrides.ownerAuthority ?? "none",
    counts: {
      creatorRows: 1,
      tombstonedGameRows: 2,
      activeGameRows: 0,
      packageRevisionRows: 1,
      artifactLocators: 2,
      artifactsPresent: 2,
      releaseRows: 0,
      currentReleaseRows: 0,
      activeCreatorCollisions: 0,
      ...overrides.counts,
    },
    artifactStatus: overrides.artifactStatus ?? "COMPLETE",
    dbVersionToken: overrides.dbVersionToken ?? "a".repeat(64),
  };
}

function code(error: unknown) {
  assert.ok(error instanceof CreatorRecoveryError);
  return error.code;
}

test("request contract is exact-target, defaults to zero-write dry-run, and rejects widening", () => {
  assert.deepEqual(parseCreatorRecoveryRequest({ slug: "moi-lab2" }), {
    slug: "moi-lab2",
    dryRun: true,
  });
  assert.deepEqual(parseCreatorRecoveryRequest({
    slug: "moi-lab2",
    dryRun: false,
    operationId,
    planReceipt: "b".repeat(64),
  }), {
    slug: "moi-lab2",
    dryRun: false,
    operationId,
    planReceipt: "b".repeat(64),
  });
  for (const input of [
    {},
    { slug: "*" },
    { slug: "moi-lab2", aggregate: true },
    { slug: ["moi-lab2", "second"] },
    { slug: "moi-lab2", operationId },
    { slug: "moi-lab2", dryRun: false },
    { slug: "moi-lab2", dryRun: false, operationId, planReceipt: "short" },
  ]) {
    assert.throws(
      () => parseCreatorRecoveryRequest(input),
      (error) => code(error) === "CREATOR_RECOVERY_INPUT_INVALID",
    );
  }
});

test("fixed 2-game/1-package/2-artifact/0-release shape is fail-closed", () => {
  assert.doesNotThrow(() => assertCreatorRecoveryPreconditions(snapshot()));
  const failures: CreatorRecoverySnapshot[] = [
    snapshot({ creatorLifecycle: "active" }),
    snapshot({ ownerAuthority: "bound" }),
    snapshot({ counts: { creatorRows: 0 } }),
    snapshot({ counts: { tombstonedGameRows: 1 } }),
    snapshot({ counts: { tombstonedGameRows: 3 } }),
    snapshot({ counts: { activeGameRows: 1 } }),
    snapshot({ counts: { packageRevisionRows: 0 } }),
    snapshot({ counts: { packageRevisionRows: 2 } }),
    snapshot({ counts: { artifactLocators: 1 } }),
    snapshot({ counts: { artifactsPresent: 1 } }),
    snapshot({ artifactStatus: "PARTIAL" }),
    snapshot({ counts: { releaseRows: 1 } }),
    snapshot({ counts: { currentReleaseRows: 1 } }),
    snapshot({ counts: { activeCreatorCollisions: 1 } }),
    snapshot({ dbVersionToken: "not-a-token" }),
  ];
  for (const input of failures) {
    assert.throws(
      () => assertCreatorRecoveryPreconditions(input),
      (error) => code(error) === "CREATOR_RECOVERY_PRECONDITION_FAILED",
    );
  }
  try {
    assertCreatorRecoveryPreconditions(snapshot({ counts: { artifactsPresent: 1 } }));
    assert.fail("artifact precondition should fail");
  } catch (error) {
    assert.ok(error instanceof CreatorRecoveryError);
    assert.deepEqual(error.diagnostic, {
      phase: "dry-run-planning",
      store: "git-artifacts",
    });
  }
});

function fakeAdapter() {
  const prepared = createCreatorRecoveryPlan("development", snapshot());
  let operation: { id: string; planReceipt: string; terminalReceipt: string } | null = null;
  let quarantineItems = 0;
  let mutationCalls = 0;
  return {
    state: () => ({ operation: operation ? { ...operation } : null, quarantineItems, mutationCalls }),
    adapter: {
      readPlan: async () => prepared,
      quarantine: async (input: {
        operationId: string;
        planReceipt: string;
        terminalReceipt: string;
        concurrencyToken: string;
        faultAt?: CreatorRecoveryFaultPoint;
      }) => {
        mutationCalls += 1;
        if (operation && operation.id !== input.operationId) {
          throw new CreatorRecoveryError("CREATOR_RECOVERY_OPERATION_CONFLICT");
        }
        if (operation) {
          return createCreatorRecoveryTerminalReceipt({
            environment: "development",
            operationId: operation.id,
            planReceipt: operation.planReceipt,
            counts: prepared.response.counts,
            replayed: true,
          });
        }
        const before = { operation, quarantineItems };
        try {
          if (input.faultAt === "before-ledger") throw new Error("injected");
          operation = {
            id: input.operationId,
            planReceipt: input.planReceipt,
            terminalReceipt: input.terminalReceipt,
          };
          if (input.faultAt === "after-ledger") throw new Error("injected");
          quarantineItems = 2;
          if (input.faultAt === "after-quarantine-items") throw new Error("injected");
          if (input.faultAt === "before-terminal") throw new Error("injected");
          return createCreatorRecoveryTerminalReceipt({
            environment: "development",
            operationId: input.operationId,
            planReceipt: input.planReceipt,
            counts: prepared.response.counts,
            replayed: false,
          });
        } catch (error) {
          operation = before.operation;
          quarantineItems = before.quarantineItems;
          throw error;
        }
      },
    },
    plan: prepared.response,
  };
}

test("dry-run returns a PII-minimal plan and invokes no mutation adapter", async () => {
  const fake = fakeAdapter();
  const result = await processCreatorRecoveryRequest({ slug: "moi-lab2" }, fake.adapter);
  assert.ok("dryRun" in result);
  assert.equal(result.dryRun, true);
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.counts.tombstonedGameRows, 2);
  assert.equal(fake.state().mutationCalls, 0);
  assert.doesNotMatch(
    JSON.stringify(result),
    /playerId|owner_player|accountRef|email|token|credential|title|description|manifest|game body|package body/i,
  );
});

test("execution requires the exact dry-run receipt before entering the mutation adapter", async () => {
  const fake = fakeAdapter();
  await assert.rejects(
    processCreatorRecoveryRequest({
      slug: "moi-lab2",
      dryRun: false,
      operationId,
      planReceipt: "f".repeat(64),
    }, fake.adapter),
    (error) => code(error) === "CREATOR_RECOVERY_PLAN_RECEIPT_MISMATCH",
  );
  assert.equal(fake.state().mutationCalls, 0);
});

test("a concurrent version change fails closed with fixed non-sensitive diagnostics", async () => {
  const fake = fakeAdapter();
  await assert.rejects(
    processCreatorRecoveryRequest({
      slug: "moi-lab2",
      dryRun: false,
      operationId,
      planReceipt: fake.plan.planReceipt,
    }, {
      readPlan: fake.adapter.readPlan,
      quarantine: async () => {
        throw new CreatorRecoveryError(
          "CREATOR_RECOVERY_CONCURRENT_CHANGE",
          { phase: "quarantine-transaction", store: "sdk-postgres" },
        );
      },
    }),
    (error) => {
      assert.ok(error instanceof CreatorRecoveryError);
      assert.equal(error.code, "CREATOR_RECOVERY_CONCURRENT_CHANGE");
      assert.deepEqual(error.diagnostic, {
        phase: "quarantine-transaction",
        store: "sdk-postgres",
      });
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /player|owner|account|email|token|credential/i);
      return true;
    },
  );
  assert.deepEqual(fake.state().operation, null);
  assert.equal(fake.state().quarantineItems, 0);
});

test("quarantine recovery is non-public, unbound, provenance-preserving, and stage-separated", async () => {
  const fake = fakeAdapter();
  const result = await processCreatorRecoveryRequest({
    slug: "moi-lab2",
    dryRun: false,
    operationId,
    planReceipt: fake.plan.planReceipt,
  }, fake.adapter);
  assert.ok("state" in result);
  assert.equal(result.state, "quarantined");
  assert.equal(result.visibility, "non-public");
  assert.equal(result.ownerBinding, "unbound");
  assert.equal(result.publication, "blocked");
  assert.equal(result.logicalRecoveryWrites, 1);
  assert.equal(result.nextStageRequiresSeparateAuthorization, true);
  assert.deepEqual(result.counts, {
    tombstonedGameRows: 2,
    packageRevisionRows: 1,
    artifactLocators: 2,
    releaseRows: 0,
  });
});

test("completed replay is receipt-stable and a different operation fails closed", async () => {
  const fake = fakeAdapter();
  const first = await processCreatorRecoveryRequest({
    slug: "moi-lab2",
    dryRun: false,
    operationId,
    planReceipt: fake.plan.planReceipt,
  }, fake.adapter);
  const replay = await processCreatorRecoveryRequest({
    slug: "moi-lab2",
    dryRun: false,
    operationId,
    planReceipt: fake.plan.planReceipt,
  }, fake.adapter);
  assert.ok("state" in first);
  assert.ok("state" in replay);
  assert.equal(replay.terminalReceipt, first.terminalReceipt);
  assert.equal(replay.replayed, true);
  assert.equal(replay.logicalRecoveryWrites, 0);
  await assert.rejects(
    processCreatorRecoveryRequest({
      slug: "moi-lab2",
      dryRun: false,
      operationId: otherOperationId,
      planReceipt: fake.plan.planReceipt,
    }, fake.adapter),
    (error) => code(error) === "CREATOR_RECOVERY_OPERATION_CONFLICT",
  );
  assert.equal(fake.state().quarantineItems, 2);
});

test("fault injection at every ledger/transaction boundary rolls back quarantine state", async () => {
  for (const faultAt of [
    "before-ledger",
    "after-ledger",
    "after-quarantine-items",
    "before-terminal",
  ] as const) {
    const fake = fakeAdapter();
    await assert.rejects(processCreatorRecoveryRequest({
      slug: "moi-lab2",
      dryRun: false,
      operationId,
      planReceipt: fake.plan.planReceipt,
    }, fake.adapter, { faultAt }));
    assert.deepEqual(fake.state().operation, null);
    assert.equal(fake.state().quarantineItems, 0);
  }
});

test("source adapter uses serializable row locks and never resurrects or binds source rows", () => {
  const store = readFileSync(
    "apps/sdk-portal/lib/creator-quarantine-recovery-store.ts",
    "utf8",
  );
  const internal = readFileSync(
    "apps/sdk-portal/app/api/internal/recovery/creator-quarantine/route.ts",
    "utf8",
  );
  const admin = readFileSync(
    "app/api/admin/sdk-creator-quarantine-recovery/route.ts",
    "utf8",
  );
  const migration = readFileSync(
    "db/sdk/010_bounded_creator_quarantine_recovery.sql",
    "utf8",
  );
  assert.match(store, /isolationLevel: "Serializable"/);
  assert.ok((store.match(/FOR UPDATE/g) ?? []).length >= 5);
  assert.match(store, /sdk_creator_recovery_operations/);
  assert.match(store, /sdk_creator_recovery_quarantine_games/);
  assert.match(store, /SELECT o\.operation_id, g\.id/);
  assert.doesNotMatch(store, /UPDATE sdk_(?:creators|games)\b/i);
  assert.doesNotMatch(store, /INSERT INTO sdk_(?:creators|games)\b/i);
  assert.doesNotMatch(store, /SET\s+owner_player_id|sdk_oauth|management_token_hash/i);
  assert.match(migration, /ON DELETE RESTRICT/g);
  assert.match(migration, /CHECK \(visibility = 'non-public'\)/);
  assert.match(migration, /CHECK \(owner_binding_state = 'unbound'\)/);
  assert.match(migration, /CHECK \(publication_state = 'blocked'\)/);
  assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
  assert.match(internal, /requireSdkServiceRequest/);
  assert.match(admin, /requireFullSiteAdminSession/);
  assert.match(internal + admin, /private, no-store/g);
  assert.doesNotMatch(internal + admin, /faultAt/);
});

test("T-122/T-123 deletion safeguards remain separate from bounded recovery writes", () => {
  const recovery = [
    "apps/sdk-portal/lib/creator-quarantine-recovery.ts",
    "apps/sdk-portal/lib/creator-quarantine-recovery-store.ts",
    "apps/sdk-portal/app/api/internal/recovery/creator-quarantine/route.ts",
    "app/api/admin/sdk-creator-quarantine-recovery/route.ts",
    "db/sdk/010_bounded_creator_quarantine_recovery.sql",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(recovery, /player_deletion_operations|blockSdkAccountForDeletion|trigger_kind/);
  assert.doesNotMatch(recovery, /account merge|owner transfer|automatic approval/i);
});
