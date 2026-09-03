import assert from "node:assert/strict";
import test from "node:test";
import {
  developmentRoomFixtureNamespace,
  developmentRoomFixtureOperationStorageKey,
  developmentRoomFixturePointerShouldClear,
  developmentRoomFixtureScenario,
  parseDevelopmentRoomFixtureOperationPointer,
  parseDevelopmentRoomFixturePublicReceipt,
  serializeDevelopmentRoomFixtureOperationPointer,
  type DevelopmentRoomFixturePublicReceipt,
} from "../lib/development-room-fixture-public-contract.ts";

const operationId = "4e5a7c28-117f-4c48-98b7-c843de4bfa71";

function identities(count: number) {
  return Array.from({ length: count }, (_, index) => index.toString(16).padStart(64, "0"));
}

function readyReceipt(builtInTargets: number, sdkTargets: number) {
  const total = builtInTargets + sdkTargets;
  return {
    schemaVersion: 1,
    namespace: developmentRoomFixtureNamespace,
    operationId,
    scenario: developmentRoomFixtureScenario,
    state: "ready",
    idempotentReplay: false,
    createdAt: 1_800_000_000_000,
    expiresAt: 1_800_001_800_000,
    counts: {
      builtInTargets,
      sdkTargets,
      cleanupTargets: 0,
      remainingTargets: total,
    },
    targetIdentities: identities(total),
    verification: {
      builtInIndexMembers: builtInTargets,
      sdkIndexMembers: sdkTargets,
      builtInFirstStoragePageFiltered: true,
      sdkFirstStoragePageFiltered: true,
      builtInLaterJoinableJa: true,
      builtInLaterJoinableEn: true,
      sdkLaterJoinable: true,
    },
  } satisfies DevelopmentRoomFixturePublicReceipt;
}

test("ready receipt accepts both the 275 minimum and a consistent 276 target result", () => {
  assert.equal(
    parseDevelopmentRoomFixturePublicReceipt(readyReceipt(138, 137), operationId)
      .counts.remainingTargets,
    275,
  );
  assert.equal(
    parseDevelopmentRoomFixturePublicReceipt(readyReceipt(138, 138), operationId)
      .counts.remainingTargets,
    276,
  );
});

test("ready receipt rejects maximum overflow, count mismatch, and duplicate identities", () => {
  assert.throws(
    () => parseDevelopmentRoomFixturePublicReceipt(readyReceipt(264, 137), operationId),
    /RECEIPT_INVALID/,
  );
  const mismatch = readyReceipt(138, 137);
  mismatch.counts.remainingTargets = 274;
  assert.throws(
    () => parseDevelopmentRoomFixturePublicReceipt(mismatch, operationId),
    /RECEIPT_INVALID/,
  );
  const duplicate = readyReceipt(138, 137);
  duplicate.targetIdentities[274] = duplicate.targetIdentities[0]!;
  assert.throws(
    () => parseDevelopmentRoomFixturePublicReceipt(duplicate, operationId),
    /RECEIPT_INVALID/,
  );
});

test("operation pointer is localStorage-safe and scoped by environment, creator, and namespace", () => {
  const raw = serializeDevelopmentRoomFixtureOperationPointer({
    creatorSlug: "test10-1",
    operationId,
    expiresAt: 1_800_001_800_000,
  });
  const restoredInNewTab = parseDevelopmentRoomFixtureOperationPointer(raw, "test10-1");
  assert.equal(restoredInNewTab?.operationId, operationId);
  assert.equal(restoredInNewTab?.expiresAt, 1_800_001_800_000);
  assert.equal(parseDevelopmentRoomFixtureOperationPointer(raw, "another-creator"), null);
  assert.match(
    developmentRoomFixtureOperationStorageKey("test10-1"),
    /^game-fields:development:t185-room-discovery-v1:test10-1:operation$/,
  );
});

test("unknown results retain the pointer; confirmed expiry, cleaned, and 404 clear it", () => {
  assert.equal(developmentRoomFixturePointerShouldClear({}), false);
  assert.equal(developmentRoomFixturePointerShouldClear({ responseStatus: 500 }), false);
  assert.equal(developmentRoomFixturePointerShouldClear({ responseStatus: 404 }), true);
  assert.equal(developmentRoomFixturePointerShouldClear({
    receipt: readyReceipt(138, 137),
    confirmedServerNow: 1_800_001_799_999,
  }), false);
  assert.equal(developmentRoomFixturePointerShouldClear({
    receipt: readyReceipt(138, 137),
    confirmedServerNow: 1_800_001_800_000,
  }), true);
  const cleaned = {
    ...readyReceipt(138, 137),
    state: "cleaned",
    counts: {
      builtInTargets: 138,
      sdkTargets: 137,
      cleanupTargets: 275,
      remainingTargets: 0,
    },
    verification: {
      ...readyReceipt(138, 137).verification,
      targetCleanupConfirmed: true,
      baselineUnchanged: false,
    },
  } satisfies DevelopmentRoomFixturePublicReceipt;
  const parsed = parseDevelopmentRoomFixturePublicReceipt(cleaned, operationId);
  assert.equal(developmentRoomFixturePointerShouldClear({ receipt: parsed }), true);
});
