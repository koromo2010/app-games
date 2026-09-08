import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateProductionPrivateWorkspaceBundle, productionPrivateWorkspaceOperationId, productionPrivateWorkspaceImportRecoveryIdentity,
  type ProductionPrivateWorkspaceImportBeforeState } from "../apps/sdk-portal/lib/production-private-workspace-import.ts";
import { completionEvidenceDigest, originalCompletionEntityDigest } from "../apps/sdk-portal/lib/production-private-workspace-completion-evidence.ts";
import { isCompletionEvidence } from "../lib/production-private-workspace-completion-evidence-contract.ts";

/** Offline only. Inputs never reach fetch, a DB driver, a plan endpoint, or importAtomic. */
export function compareOriginalCompletionEvidence(input: {
  archive: Uint8Array; evidence: unknown; originalPlan?: unknown; originalBeforeState?: ProductionPrivateWorkspaceImportBeforeState;
}) {
  if (!isCompletionEvidence(input.evidence)) throw new Error("OFFLINE_COMPLETION_EVIDENCE_INVALID");
  const bundle = validateProductionPrivateWorkspaceBundle({target:"moi-lab2", archive:input.archive});
  const operationId = productionPrivateWorkspaceOperationId(bundle);
  if (operationId !== "06eb6940-fd24-59b0-8d00-47eba9a9ce8c"
    || bundle.workspaceManifestSha256 !== "67fa5f4abe34a42a64176b71b3a3a84d833833d8979b57fbfad410576bf94ec2"
    || bundle.perGameLedgerSha256 !== "e350673a1deef5f5f58c2f6e0d7afa9bf9e48dba91f62ac73e4e639e66348a8a") throw new Error("OFFLINE_APPROVED_IDENTITY_MISMATCH");
  const evidence = input.evidence;
  if (evidence.assessment !== "unique") throw new Error("OFFLINE_COMPLETION_EVIDENCE_NOT_UNIQUE");
  const plan = input.originalPlan && typeof input.originalPlan === "object" && !Array.isArray(input.originalPlan)
    ? input.originalPlan as Record<string, unknown> : null;
  // This compares saved fields, not the authenticity/provenance of the supplied file.
  const planMatch = input.originalPlan === undefined ? "not-assessed" : plan?.schemaVersion === 1
    && plan.environment === "production" && plan.target === "moi-lab2" && plan.phase === "plan" && plan.writesPerformed === 0
    && plan.planReceipt === evidence.planReceipt && plan.beforeStateSha256 === evidence.beforeStateSha256 ? "pass" : "fail";
  const bundleReceipt = {bytes:bundle.bundleBytes,sha256:bundle.bundleSha256,schemaVersion:bundle.schemaVersion,gameCount:bundle.gameCount,
    entryCount:bundle.entryCount,runtimeFileCount:bundle.runtimeFileCount,workspaceManifestSha256:bundle.workspaceManifestSha256,
    perGameLedgerSha256:bundle.perGameLedgerSha256,gameIdentitySetSha256:bundle.gameIdentitySetSha256,
    perGameIdentitySha256:bundle.perGameIdentitySha256,contentSetSha256:bundle.contentSetSha256};
  const expectedPlan = {schemaVersion:1,environment:"production",target:"moi-lab2",phase:"plan",writesPerformed:0,bundle:bundleReceipt,
    recoveryIdentity:productionPrivateWorkspaceImportRecoveryIdentity,
    intendedMutations:{privateWorkspaceRows:1,privateGameRows:bundle.gameCount,privateFileRows:bundle.runtimeFileCount,
      visibility:"private-quarantined",ownerBinding:"unbound",grants:0,releases:0,publications:0,aliases:0,rooms:0},
    beforeStateSha256:evidence.beforeStateSha256,planReceipt:evidence.planReceipt};
  const before = input.originalBeforeState;
  return {schemaVersion:1, operationId, scope:"OFFLINE_ONLY_NO_REPAIR_AUTHORIZATION",
    originalBundleMatch: originalCompletionEntityDigest(bundle, operationId) === evidence.originalComparableSha256 ? "pass" : "fail",
    originalPlanReceiptAndBeforeHashMatch:planMatch,
    originalPlanFullContractMatch:input.originalPlan === undefined ? "not-assessed" : planMatch === "pass" && completionEvidenceDigest(input.originalPlan) === completionEvidenceDigest(expectedPlan) ? "pass" : "fail",
    originalBeforeStateMatch: before === undefined ? "not-assessed" : completionEvidenceDigest(before) === evidence.beforeStateSha256 ? "pass" : "fail",
    originalStoredTokensMatch: before === undefined ? "not-assessed" : completionEvidenceDigest({sourceStateToken:before.sourceStateToken,
      publicStateToken:before.publicStateToken, unrelatedPrivateStateToken:before.unrelatedPrivateStateToken}) === evidence.storedScopeHashesSha256 ? "pass" : "fail",
    sourceDocumentProvenance:"REQUIRES_IMMUTABLE_RECORD_REVIEW", broadTokenHistory:"not-assessed", repairEligibility:"not-assessed"};
}

function main() {
  const values = new Map<string,string>();
  const args = process.argv.slice(2);
  for (let i=0; i<args.length; i+=2) {
    if (!["--bundle", "--evidence", "--original-plan", "--original-before-state"].includes(args[i]) || !args[i+1] || values.has(args[i])) throw new Error("OFFLINE_ARGUMENTS_INVALID");
    values.set(args[i], args[i+1]);
  }
  if (!values.has("--bundle") || !values.has("--evidence")) throw new Error("OFFLINE_BUNDLE_AND_SAVED_EVIDENCE_REQUIRED");
  const json = (key:string) => values.has(key) ? JSON.parse(readFileSync(values.get(key)!, "utf8")) : undefined;
  const result = compareOriginalCompletionEvidence({archive:readFileSync(values.get("--bundle")!), evidence:json("--evidence"),
    originalPlan:json("--original-plan"), originalBeforeState:json("--original-before-state")});
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch { process.stderr.write("OFFLINE_COMPLETION_COMPARISON_FAILED_NO_NETWORK_OR_WRITE\n"); process.exitCode=1; }
}
