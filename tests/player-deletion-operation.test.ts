import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  drivePlayerDeletion,
  playerDeletionDiagnostic,
  playerDeletionSteps,
  type PlayerDeletionOperation,
} from "../lib/player-deletion-operation.ts";

function operation(completedSteps: PlayerDeletionOperation["completedSteps"] = []): PlayerDeletionOperation {
  return {
    operationId: "11111111-1111-4111-8111-111111111111",
    playerId: "private-player-id",
    trigger: "explicit",
    state: "active",
    completedSteps,
  };
}

test("every store-boundary failure resumes without reviving or repeating completed steps", async () => {
  for (let failureIndex = 0; failureIndex < playerDeletionSteps.length; failureIndex += 1) {
    const completed: PlayerDeletionOperation["completedSteps"] = [];
    const calls: string[] = [];
    await assert.rejects(drivePlayerDeletion(operation(completed), {
      runStep: async (step) => {
        calls.push(step);
        if (step === playerDeletionSteps[failureIndex]) throw new Error("INJECTED_STORE_FAILURE");
      },
      completeStep: async (_id, step) => { completed.push(step); },
      completeOperation: async () => assert.fail("must not complete after a failed step"),
    }), /INJECTED_STORE_FAILURE/);

    const firstPassCompleted = [...completed];
    let terminal = false;
    await drivePlayerDeletion(operation(completed), {
      runStep: async (step) => { calls.push(step); },
      completeStep: async (_id, step) => { completed.push(step); },
      completeOperation: async () => { terminal = true; },
    });
    assert.equal(terminal, true);
    assert.deepEqual(completed, [...playerDeletionSteps]);
    for (const step of firstPassCompleted) {
      assert.equal(calls.filter((item) => item === step).length, 1, `${step} must not repeat`);
    }
  }
});

test("a crash between an idempotent handler and ledger write safely replays only that handler", async () => {
  const completed: PlayerDeletionOperation["completedSteps"] = [];
  const effects = new Set<string>();
  let injected = false;
  await assert.rejects(drivePlayerDeletion(operation(completed), {
    runStep: async (step) => { effects.add(step); },
    completeStep: async (_id, step) => {
      if (step === "dependent-data-deleted" && !injected) {
        injected = true;
        throw new Error("LEDGER_WRITE_FAILED");
      }
      completed.push(step);
    },
    completeOperation: async () => undefined,
  }), /LEDGER_WRITE_FAILED/);
  await drivePlayerDeletion(operation(completed), {
    runStep: async (step) => { effects.add(step); },
    completeStep: async (_id, step) => { completed.push(step); },
    completeOperation: async () => undefined,
  });
  assert.deepEqual([...effects], [...playerDeletionSteps]);
  assert.deepEqual(completed, [...playerDeletionSteps]);
});

test("operator diagnostics contain no player, PII, token, or body", () => {
  const diagnostic = playerDeletionDiagnostic(operation(["sdk-revoked"]));
  const serialized = JSON.stringify(diagnostic);
  assert.deepEqual(Object.keys(diagnostic).sort(), [
    "completedStepCount", "operationId", "pendingStepCount", "state", "trigger",
  ]);
  assert.doesNotMatch(serialized, /private-player-id|email|token|password|body/i);
});

test("source contract persists intent before deletion and blocks all auth surfaces", () => {
  const account = readFileSync("lib/player-account-store.ts", "utf8");
  const auth = readFileSync("lib/player-auth.ts", "utf8");
  const sdkRoute = readFileSync("apps/sdk-portal/app/api/internal/accounts/route.ts", "utf8");
  const sdkSession = readFileSync("apps/sdk-portal/lib/account-session.ts", "utf8");
  const oauth = readFileSync("apps/sdk-portal/lib/oauth-store.ts", "utf8");
  assert.match(account, /beginPlayerDeletion\(account\.playerId, "explicit"\)[\s\S]*driveStoredPlayerDeletion/);
  assert.match(account, /resumePendingPlayerDeletions\(\)/);
  assert.match(auth, /playerDeletionBlocksAccess\(playerId\)/);
  assert.match(sdkRoute, /blockSdkAccountForDeletion\(operationId, playerId\)[\s\S]*UPDATE sdk_games/);
  assert.match(sdkSession, /sdkAccountDeletionBlocksAccess\(payload\.playerId\)/);
  assert.match(oauth, /createAuthorizationCode[\s\S]*sdkAccountDeletionBlocksAccess/);
  assert.match(oauth, /authenticateAccessToken[\s\S]*sdkAccountDeletionBlocksAccess/);
});
