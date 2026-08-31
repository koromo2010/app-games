import {
  developmentPrivateWorkspaceImportTargetSpecs,
  type DevelopmentPrivateWorkspaceImportTargetSpec,
} from "./development-private-workspace-import-public-contract.ts";

export const productionPrivateWorkspaceImportEnvironment = "production" as const;
export const productionPrivateWorkspaceImportIntent =
  "production-private-workspace-import-v1" as const;
export const productionPrivateWorkspaceImportSchemaVersion = 1 as const;
export const productionPrivateWorkspaceImportTarget = "moi-lab2" as const;

export type ProductionPrivateWorkspaceImportTarget =
  typeof productionPrivateWorkspaceImportTarget;

export const productionPrivateWorkspaceImportTargetSpec = Object.freeze({
  ...developmentPrivateWorkspaceImportTargetSpecs[productionPrivateWorkspaceImportTarget],
}) satisfies DevelopmentPrivateWorkspaceImportTargetSpec;

export const productionPrivateWorkspaceImportRecoveryIdentity = Object.freeze({
  operationId: "fa5eca14-a961-4bd1-9e68-78a609895971",
  terminalReceipt: "f449b3b2114ef863ea290d26c123a40ac3038e6e9861a3a576cb5bc2b9d35162",
  state: "quarantined",
  visibility: "non-public",
  ownerBinding: "unbound",
  grantState: "blocked",
  releaseState: "blocked",
  publicationState: "blocked",
} as const);

export function isProductionPrivateWorkspaceImportTarget(
  value: unknown,
): value is ProductionPrivateWorkspaceImportTarget {
  return value === productionPrivateWorkspaceImportTarget;
}
