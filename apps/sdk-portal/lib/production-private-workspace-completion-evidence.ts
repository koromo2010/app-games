import type { CompletionEvidence } from "../../../lib/production-private-workspace-completion-evidence-contract.ts";
import { createHash } from "node:crypto";
import { productionPrivateWorkspaceImportIntent, productionPrivateWorkspaceImportRecoveryIdentity,
  type ValidatedProductionPrivateWorkspaceBundle } from "./production-private-workspace-import.ts";

// These hashes are evidence, never authorization, receipts to write, or a repair decision.
export function completionEvidenceCanonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(completionEvidenceCanonicalJson).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${completionEvidenceCanonicalJson(row[key])}`).join(",")}}`;
}
export function completionEvidenceDigest(value: unknown) {
  return createHash("sha256").update(completionEvidenceCanonicalJson(value)).digest("hex");
}
const sha = /^[0-9a-f]{64}$/;
type Row = Record<string, unknown>;
function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("COMPLETION_EVIDENCE_INVALID");
  return value as Row;
}
function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) throw new Error("COMPLETION_EVIDENCE_INVALID");
  return value.map(object);
}
function validHash(value: unknown): string | null { return typeof value === "string" && sha.test(value) ? value : null; }
function fieldState(value: unknown) { return value === null ? "absent" : validHash(value) ? "valid-sha256" : "malformed"; }
function number(value: unknown) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("COMPLETION_EVIDENCE_INVALID");
  return n;
}
function pick(row: Row, fields: readonly string[]): Row {
  return Object.fromEntries(fields.map(key => {
    if (!(key in row)) throw new Error("COMPLETION_EVIDENCE_INVALID");
    return [key, row[key]];
  }));
}
const workspaceFields = ["workspace_id", "operation_id", "target_key", "environment", "visibility", "owner_binding_state",
  "bundle_bytes", "bundle_sha256", "bundle_schema_version", "game_count", "game_identity_set_sha256", "per_game_identity_sha256",
  "content_set_sha256", "workspace_manifest_sha256", "per_game_ledger_sha256", "workspace_manifest",
  "grants_created", "releases_created", "publications_created", "aliases_created", "rooms_created"] as const;
const gameFields = ["workspace_id", "game_id", "reconstruction_mode", "original_revision", "historical_restoration_claim",
  "workspace_document_sha256", "provenance_sha256", "runtime_files_sha256", "workspace_document", "runtime_file_count", "runtime_bytes"] as const;
const fileFields = ["workspace_id", "game_id", "path", "byte_length", "content_sha256", "actual_bytes", "actual_sha256"] as const;
function sorted(values: Row[], keys: string[]) {
  return [...values].sort((a,b) => {
    for (const key of keys) { const c = String(a[key]).localeCompare(String(b[key]), "en"); if (c) return c; }
    return 0;
  });
}
const operationFields = ["operation_id", "operation_nonce", "target_key", "environment", "intent", "recovery_operation_id", "recovery_terminal_receipt",
  "bundle_bytes", "bundle_sha256", "bundle_schema_version", "game_count", "entry_count", "runtime_file_count", "runtime_bytes",
  "game_identity_set_sha256", "per_game_identity_sha256", "content_set_sha256", "workspace_manifest_sha256", "per_game_ledger_sha256"] as const;
function entities(workspaces: Row[], games: Row[], files: Row[], operations: Row[]) {
  return {
    operations: sorted(operations.map(o => ({...pick(o, operationFields), runtime_bytes:number(o.runtime_bytes)})), ["operation_id"]),
    workspaces: sorted(workspaces.map(w => pick(w, workspaceFields)), ["workspace_id"]),
    games: sorted(games.map(g => ({...pick(g, gameFields), runtime_bytes: number(g.runtime_bytes)})), ["workspace_id", "game_id"]),
    files: sorted(files.map(f => pick(f, fileFields)), ["workspace_id", "game_id", "path"]),
  };
}


/** Input is ephemeral server-side SQL data. Return only this closed, secret-free projection.
 * All input rows come from the same SELECT snapshot, including the strict reader CTE.
 * No raw manifest/document, file path/content, creator ID, or broad state token is returned. */
export function projectCompletionEvidence(value: unknown): CompletionEvidence {
  const input = object(value);
  const operations = rows(input.operations), workspaces = rows(input.workspaces), games = rows(input.games), files = rows(input.files);
  const result: CompletionEvidence = {
    schemaVersion: 1, snapshot: "single-statement", assessment: "not-assessed",
    operationSnapshotSha256: completionEvidenceDigest(operations),
    entitySnapshotSha256: completionEvidenceDigest({workspaces, games, files}),
    originalComparableSha256: completionEvidenceDigest(entities(workspaces, games, files, operations)),
    planReceipt: null, beforeStateSha256: null, storedScopeHashesSha256: null,
    terminalReceiptState: "not-assessed", readBackShaState: "not-assessed", completedAtState: "not-assessed", completedAtOrder: "not-assessed",
    approvedBeforeStateSelfConsistency: "not-assessed", planSelfConsistency: "not-assessed", fileContentHashes: "not-assessed", gameFileSets: "not-assessed", gameProvenance: "not-assessed",
    originalBundleMatch: "not-assessed", originalPlanMatch: "not-assessed", originalBeforeStateMatch: "not-assessed",
    broadTokenHistory: "not-assessed", repairEligibility: "not-assessed",
  };
  if (operations.length !== 1 || workspaces.length !== 1) return result;
  const o = operations[0];
  result.assessment = "unique";
  result.planReceipt = validHash(o.plan_receipt);
  result.beforeStateSha256 = validHash(o.before_state_sha256);
  result.storedScopeHashesSha256 = [o.source_state_token, o.public_state_token, o.unrelated_private_state_token].every(validHash)
    ? completionEvidenceDigest({sourceStateToken:o.source_state_token, publicStateToken:o.public_state_token, unrelatedPrivateStateToken:o.unrelated_private_state_token}) : null;
  result.terminalReceiptState = fieldState(o.terminal_receipt);
  result.readBackShaState = fieldState(o.read_back_sha256);
  const completed = typeof o.completed_at === "string" ? Date.parse(o.completed_at) : NaN;
  result.completedAtState = o.completed_at === null ? "absent" : Number.isFinite(completed) ? "valid-timestamp" : "malformed";
  result.completedAtOrder = result.completedAtState !== "valid-timestamp" ? "not-assessed"
    : completed >= Date.parse(String(o.created_at)) && completed <= Date.parse(String(o.updated_at)) ? "pass" : "fail";
  const manifest = object(workspaces[0].workspace_manifest);
  // Reconstructed from v012's REQUIRED preconditions plus stored tokens, NOT an observed historical row.
  // A matching digest is internal consistency; originalBeforeStateMatch remains not-assessed.
  if (typeof manifest.creatorRowId === "string" && /^[0-9a-f-]{36}$/.test(manifest.creatorRowId) && result.storedScopeHashesSha256) {
    const before = {targetCreatorRowId:manifest.creatorRowId, targetCreatorRows:1, targetDeletedCreatorRows:1, targetCreatorOwnerRows:0,
      targetGameRows:2, targetDeletedGameRows:2, targetActiveGameRows:0, targetReleaseRows:0, targetCurrentReleaseRows:0,
      recoveryOperationRows:1, recoveryQuarantineGameRows:2, recoveryIdentityExact:true,
      targetWorkspaceRows:0, targetWorkspaceGameRows:0, targetWorkspaceFileRows:0,
      sourceStateToken:o.source_state_token, publicStateToken:o.public_state_token, unrelatedPrivateStateToken:o.unrelated_private_state_token};
    result.approvedBeforeStateSelfConsistency = completionEvidenceDigest(before) === result.beforeStateSha256 ? "pass" : "fail";
  }
  const bundle = {bytes:o.bundle_bytes, sha256:o.bundle_sha256, schemaVersion:o.bundle_schema_version, gameCount:o.game_count,
    entryCount:o.entry_count, runtimeFileCount:o.runtime_file_count, workspaceManifestSha256:o.workspace_manifest_sha256,
    perGameLedgerSha256:o.per_game_ledger_sha256, gameIdentitySetSha256:o.game_identity_set_sha256,
    perGameIdentitySha256:o.per_game_identity_sha256, contentSetSha256:o.content_set_sha256};
  const computedPlan = completionEvidenceDigest({schemaVersion:1, environment:"production", target:"moi-lab2",
    intent:productionPrivateWorkspaceImportIntent, recoveryIdentity:productionPrivateWorkspaceImportRecoveryIdentity, bundle,
    intendedMutations:{privateWorkspaceRows:1, privateGameRows:o.game_count, privateFileRows:o.runtime_file_count,
      visibility:"private-quarantined", ownerBinding:"unbound", grants:0, releases:0, publications:0, aliases:0, rooms:0},
    beforeStateSha256:o.before_state_sha256});
  result.planSelfConsistency = result.planReceipt && result.beforeStateSha256 && computedPlan === result.planReceipt ? "pass" : "fail";
  result.fileContentHashes = files.length > 0 && files.every(f => validHash(f.content_sha256) && f.content_sha256 === f.actual_sha256 && number(f.byte_length) === number(f.actual_bytes)) ? "pass" : "fail";
  result.gameFileSets = games.length > 0 && games.every(g => {
    const own = files.filter(f => f.workspace_id === g.workspace_id && f.game_id === g.game_id).sort((a,b) => String(a.path).localeCompare(String(b.path)));
    return own.length === number(g.runtime_file_count) && own.reduce((sum,f) => sum + number(f.actual_bytes),0) === number(g.runtime_bytes)
      && completionEvidenceDigest(own.map(f => ({path:f.path, bytes:number(f.actual_bytes), sha256:f.actual_sha256}))) === g.runtime_files_sha256;
  }) && files.every(f => games.some(g => g.workspace_id === f.workspace_id && g.game_id === f.game_id)) ? "pass" : "fail";
  result.gameProvenance = games.length > 0 && games.every(g => {
    const doc = object(g.workspace_document);
    return "provenance" in doc && completionEvidenceDigest(doc.provenance) === g.provenance_sha256;
  }) ? "pass" : "fail";
  return result;
}

/** Reconstruct expected saved entity columns from a fully validated OFFLINE original bundle.
 * JSONB documents are compared semantically with the same canonical JSON algorithm;
 * original raw document/manifest SHA values remain independently included in the digest. */
export function originalCompletionEntityDigest(bundle: ValidatedProductionPrivateWorkspaceBundle, operationId: string) {
  const workspace = {workspace_id:operationId, operation_id:operationId, target_key:bundle.target, environment:"production",
    visibility:"private-quarantined", owner_binding_state:"unbound", bundle_bytes:bundle.bundleBytes, bundle_sha256:bundle.bundleSha256,
    bundle_schema_version:bundle.schemaVersion, game_count:bundle.gameCount, game_identity_set_sha256:bundle.gameIdentitySetSha256,
    per_game_identity_sha256:bundle.perGameIdentitySha256, content_set_sha256:bundle.contentSetSha256,
    workspace_manifest_sha256:bundle.workspaceManifestSha256, per_game_ledger_sha256:bundle.perGameLedgerSha256,
    workspace_manifest:bundle.workspaceManifest, grants_created:0, releases_created:0, publications_created:0, aliases_created:0, rooms_created:0};
  const games = bundle.games.map(g => ({workspace_id:operationId, game_id:g.gameId, reconstruction_mode:g.reconstructionMode,
    original_revision:g.originalRevision, historical_restoration_claim:false, workspace_document_sha256:g.workspaceDocumentSha256,
    provenance_sha256:g.provenanceSha256, runtime_files_sha256:g.runtimeFilesSha256, workspace_document:g.workspaceDocument,
    runtime_file_count:g.runtimeFiles.length, runtime_bytes:g.runtimeFiles.reduce((sum,f) => sum + f.bytes,0)}));
  const files = bundle.games.flatMap(g => g.runtimeFiles.map(f => ({workspace_id:operationId, game_id:g.gameId, path:f.path,
    byte_length:f.bytes, content_sha256:f.sha256, actual_bytes:f.bytes, actual_sha256:f.sha256})));
  const operation = {...pick(workspace, ["operation_id", "target_key", "environment", "bundle_bytes", "bundle_sha256", "bundle_schema_version",
    "game_count", "game_identity_set_sha256", "per_game_identity_sha256", "content_set_sha256", "workspace_manifest_sha256", "per_game_ledger_sha256"]),
    operation_nonce:operationId, intent:productionPrivateWorkspaceImportIntent,
    recovery_operation_id:productionPrivateWorkspaceImportRecoveryIdentity.operationId,
    recovery_terminal_receipt:productionPrivateWorkspaceImportRecoveryIdentity.terminalReceipt,
    entry_count:bundle.entryCount, runtime_file_count:bundle.runtimeFileCount, runtime_bytes:bundle.runtimeBytes};
  return completionEvidenceDigest(entities([workspace],games,files,[operation]));
}
