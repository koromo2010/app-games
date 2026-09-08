import { isCompletionEvidence, type CompletionEvidence } from "./production-private-workspace-completion-evidence-contract.ts";
import {
  isDiagnosticFailureCode,
  type ProductionOwnerRestorationDiagnosticFailureCode,
} from "./production-owner-restoration-diagnostic.ts";

type DiagnosticStatus = "pass" | "fail" | "not-assessed";

export type CompletionDiagnostic = {
  completionEvidence?: CompletionEvidence;
  schemaVersion: 1;
  operationId: "06eb6940-fd24-59b0-8d00-47eba9a9ce8c";
  database: { canonicalReaderSelector: string; diagnosticSelector: string; selectorMatch: boolean; canonicalReaderFingerprint: string | null; diagnosticFingerprint: string | null; fingerprintMatch: boolean };
  schema: { version: "not-version-gated"; evidence: "canonical-query-confirmed"; metadata: "confirmed" | "permission-unavailable" | "namespace-mismatch" | "unavailable" };
  tables: Record<"operations" | "workspaces" | "games" | "files", DiagnosticStatus>;
  operation: { row: "absent" | "unique" | "multiple" | "not-assessed"; operationIdExact: DiagnosticStatus; nonceExact: DiagnosticStatus; environmentExact: DiagnosticStatus; intentExact: DiagnosticStatus; state: "completed" | "pending" | "other" | "ambiguous" | "not-assessed"; phase: "imported-private" | "ledger-recorded" | "other" | "ambiguous" | "not-assessed"; terminalReceiptPresent: DiagnosticStatus; readBackShaPresent: DiagnosticStatus };
  workspace: { join: "absent" | "unique" | "multiple" | "not-assessed"; identityExact: DiagnosticStatus; targetExact: DiagnosticStatus; environmentExact: DiagnosticStatus; privateQuarantined: DiagnosticStatus; ownerUnbound: DiagnosticStatus };
  integrity: Record<"bundleMatch" | "manifestMatch" | "ledgerMatch" | "remainingHashesMatch" | "games2" | "runtimeFiles21" | "runtimeBytesMatch" | "fileByteIntegrity", DiagnosticStatus>;
  nonEffects: Record<"grants0" | "releases0" | "publications0" | "aliases0" | "rooms0", DiagnosticStatus>;
  canonicalReader: { matched: boolean; excludedBy: Array<"TABLES" | "OPERATION" | "TERMINAL" | "WORKSPACE" | "INTEGRITY" | "NON_EFFECTS"> };
};

export type CompletionDiagnosticProjection =
  | { consumed: false; phase: "idle" }
  | { consumed: true; phase: "pending" }
  | { consumed: true; phase: "result"; diagnostic: CompletionDiagnostic }
  | { consumed: true; phase: "failure"; code: ProductionOwnerRestorationDiagnosticFailureCode };

const statuses = new Set<DiagnosticStatus>(["pass", "fail", "not-assessed"]);
const exclusions = new Set(["TABLES", "OPERATION", "TERMINAL", "WORKSPACE", "INTEGRITY", "NON_EFFECTS"]);

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function record(value: unknown, keys: string[]) {
  const candidate = object(value);
  return candidate && exactKeys(candidate, keys) ? candidate : null;
}

function statusValues(value: Record<string, unknown> | null, keys: string[]) {
  return !!value && keys.every((key) => statuses.has(value[key] as DiagnosticStatus));
}

export function parseCompletionDiagnostic(value: unknown): CompletionDiagnostic | null {
  const payload = object(value);
  if (!payload || !exactKeys(payload, ["schemaVersion", "operationId", "database", "schema", "tables", "operation", "workspace", "integrity", "nonEffects", "canonicalReader", ...(payload.completionEvidence === undefined ? [] : ["completionEvidence"])])) return null;
  if (payload.completionEvidence !== undefined && !isCompletionEvidence(payload.completionEvidence)) return null;
  const database = record(payload.database, ["canonicalReaderSelector", "diagnosticSelector", "selectorMatch", "canonicalReaderFingerprint", "diagnosticFingerprint", "fingerprintMatch"]);
  const schema = record(payload.schema, ["version", "evidence", "metadata"]);
  const tables = record(payload.tables, ["operations", "workspaces", "games", "files"]);
  const operation = record(payload.operation, ["row", "operationIdExact", "nonceExact", "environmentExact", "intentExact", "state", "phase", "terminalReceiptPresent", "readBackShaPresent"]);
  const workspace = record(payload.workspace, ["join", "identityExact", "targetExact", "environmentExact", "privateQuarantined", "ownerUnbound"]);
  const integrity = record(payload.integrity, ["bundleMatch", "manifestMatch", "ledgerMatch", "remainingHashesMatch", "games2", "runtimeFiles21", "runtimeBytesMatch", "fileByteIntegrity"]);
  const nonEffects = record(payload.nonEffects, ["grants0", "releases0", "publications0", "aliases0", "rooms0"]);
  const reader = record(payload.canonicalReader, ["matched", "excludedBy"]);
  if (!database || !schema || !tables || !operation || !workspace || !integrity || !nonEffects || !reader
    || payload.schemaVersion !== 1 || payload.operationId !== "06eb6940-fd24-59b0-8d00-47eba9a9ce8c"
    || typeof database.canonicalReaderSelector !== "string" || typeof database.diagnosticSelector !== "string"
    || typeof database.selectorMatch !== "boolean" || typeof database.fingerprintMatch !== "boolean"
    || (database.canonicalReaderFingerprint !== null && typeof database.canonicalReaderFingerprint !== "string")
    || (database.diagnosticFingerprint !== null && typeof database.diagnosticFingerprint !== "string")
    || schema.version !== "not-version-gated" || schema.evidence !== "canonical-query-confirmed"
    || !["confirmed", "permission-unavailable", "namespace-mismatch", "unavailable"].includes(String(schema.metadata))
    || !statusValues(tables, ["operations", "workspaces", "games", "files"])
    || !statusValues(operation, ["operationIdExact", "nonceExact", "environmentExact", "intentExact", "terminalReceiptPresent", "readBackShaPresent"])
    || !statusValues(workspace, ["identityExact", "targetExact", "environmentExact", "privateQuarantined", "ownerUnbound"])
    || !statusValues(integrity, ["bundleMatch", "manifestMatch", "ledgerMatch", "remainingHashesMatch", "games2", "runtimeFiles21", "runtimeBytesMatch", "fileByteIntegrity"])
    || !statusValues(nonEffects, ["grants0", "releases0", "publications0", "aliases0", "rooms0"])
    || !["absent", "unique", "multiple", "not-assessed"].includes(String(operation.row))
    || !["completed", "pending", "other", "ambiguous", "not-assessed"].includes(String(operation.state))
    || !["imported-private", "ledger-recorded", "other", "ambiguous", "not-assessed"].includes(String(operation.phase))
    || !["absent", "unique", "multiple", "not-assessed"].includes(String(workspace.join))
    || typeof reader.matched !== "boolean" || !Array.isArray(reader.excludedBy) || !reader.excludedBy.every((item) => typeof item === "string" && exclusions.has(item))) return null;
  return payload as CompletionDiagnostic;
}

function responseFailure(value: unknown): ProductionOwnerRestorationDiagnosticFailureCode {
  const payload = object(value);
  return payload && isDiagnosticFailureCode(payload.error)
    ? payload.error
    : "OWNER_RESTORATION_DIAGNOSTIC_UPSTREAM_UNAVAILABLE";
}

export const initialCompletionDiagnosticProjection: CompletionDiagnosticProjection = { consumed: false, phase: "idle" };

export function startCompletionDiagnosticProjection(current: CompletionDiagnosticProjection): CompletionDiagnosticProjection {
  return current.consumed ? current : { consumed: true, phase: "pending" };
}

export function projectCompletionDiagnosticResponse(status: number, payload: unknown): CompletionDiagnosticProjection {
  if (status < 200 || status >= 300) return { consumed: true, phase: "failure", code: responseFailure(payload) };
  const diagnostic = parseCompletionDiagnostic(payload);
  return diagnostic
    ? { consumed: true, phase: "result", diagnostic }
    : { consumed: true, phase: "failure", code: "OWNER_RESTORATION_DIAGNOSTIC_UPSTREAM_RESPONSE_INVALID" };
}

export function projectCompletionDiagnosticTransportFailure(): CompletionDiagnosticProjection {
  return { consumed: true, phase: "failure", code: "OWNER_RESTORATION_DIAGNOSTIC_UPSTREAM_UNAVAILABLE" };
}
