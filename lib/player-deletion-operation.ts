export const playerDeletionSteps = [
  "sdk-revoked",
  "dependent-data-deleted",
  "redis-account-deleted",
  "postgres-account-deleted",
] as const;

export type PlayerDeletionStep = typeof playerDeletionSteps[number];
export type PlayerDeletionTrigger = "explicit" | "retention";
export type PlayerDeletionOperation = {
  operationId: string;
  playerId: string;
  trigger: PlayerDeletionTrigger;
  state: "active" | "deleted";
  completedSteps: PlayerDeletionStep[];
};

export type PlayerDeletionDriver = {
  completeStep: (operationId: string, step: PlayerDeletionStep) => Promise<void>;
  runStep: (step: PlayerDeletionStep) => Promise<void>;
  completeOperation: (operationId: string) => Promise<void>;
};

/**
 * Drives one operation in a fixed order. The durable store owns the ledger;
 * handlers are idempotent, so a crash after a handler and before its ledger
 * update can only repeat a safe operation.
 */
export async function drivePlayerDeletion(
  operation: PlayerDeletionOperation,
  driver: PlayerDeletionDriver,
) {
  const completed = new Set(operation.completedSteps);
  for (const step of playerDeletionSteps) {
    if (completed.has(step)) continue;
    await driver.runStep(step);
    await driver.completeStep(operation.operationId, step);
  }
  await driver.completeOperation(operation.operationId);
  return { operationId: operation.operationId, state: "deleted" as const };
}

export function playerDeletionDiagnostic(operation: PlayerDeletionOperation) {
  return {
    operationId: operation.operationId,
    trigger: operation.trigger,
    state: operation.state,
    completedStepCount: operation.completedSteps.length,
    pendingStepCount: playerDeletionSteps.length - operation.completedSteps.length,
  };
}
