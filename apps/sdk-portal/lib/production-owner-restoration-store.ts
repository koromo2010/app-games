import {
  productionOwnerRestorationWorkspaceOperationId,
  type ProductionOwnerRestorationWorkspaceSource,
} from "../../../lib/production-owner-restoration.ts";
import type { CompletedProductionPrivateWorkspaceImport } from "./production-private-workspace-import.ts";
import { readCompletedProductionPrivateWorkspaceImport } from "./production-private-workspace-import-store.ts";

/** Resolve owner restoration only from the canonical completed A5 import contract. */
export function resolveProductionOwnerRestorationWorkspaceCandidates(
  candidates: CompletedProductionPrivateWorkspaceImport[],
): ProductionOwnerRestorationWorkspaceSource | null {
  if (candidates.length !== 1) return null;
  const completed = candidates[0]!;
  if (
    completed.target !== "moi-lab2"
    || completed.operationId !== productionOwnerRestorationWorkspaceOperationId
  ) return null;

  return {
    // A5 requires workspace_id = operation_id before returning completion.
    workspaceIdentity: completed.operationId,
    operationId: completed.operationId,
    bundleSha256: completed.bundleSha256,
    workspaceManifestSha256: completed.readBack.workspaceManifestSha256,
    perGameLedgerSha256: completed.readBack.perGameLedgerSha256,
    workspaceRows: completed.readBack.targetWorkspaceRows,
    gameRows: completed.readBack.targetWorkspaceGameRows,
    fileRows: completed.readBack.targetWorkspaceFileRows,
    // A5's completed reader only returns this exact state and zero non-effects.
    visibility: "private-quarantined",
    ownerBinding: "unbound",
    grants: completed.readBack.grantRows,
    releases: completed.readBack.releaseRows,
    publications: completed.readBack.publicationRows,
    aliases: completed.readBack.aliasRows,
    rooms: completed.readBack.roomRows,
  };
}

export async function readProductionOwnerRestorationWorkspace(
  readCompleted: typeof readCompletedProductionPrivateWorkspaceImport = readCompletedProductionPrivateWorkspaceImport,
): Promise<ProductionOwnerRestorationWorkspaceSource | null> {
  const completed = await readCompleted(productionOwnerRestorationWorkspaceOperationId);
  return resolveProductionOwnerRestorationWorkspaceCandidates(completed ? [completed] : []);
}
