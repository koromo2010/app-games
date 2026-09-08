export type CompletionEvidence = {
  schemaVersion: 1; snapshot: "single-statement";
  assessment: "unique" | "not-assessed";
  operationSnapshotSha256: string; entitySnapshotSha256: string; originalComparableSha256: string;
  planReceipt: string | null; beforeStateSha256: string | null; storedScopeHashesSha256: string | null;
  terminalReceiptState: "absent" | "valid-sha256" | "malformed" | "not-assessed";
  readBackShaState: "absent" | "valid-sha256" | "malformed" | "not-assessed";
  completedAtState: "absent" | "valid-timestamp" | "malformed" | "not-assessed";
  completedAtOrder: "pass" | "fail" | "not-assessed";
  approvedBeforeStateSelfConsistency: "pass" | "fail" | "not-assessed";
  planSelfConsistency: "pass" | "fail" | "not-assessed";
  fileContentHashes: "pass" | "fail" | "not-assessed";
  gameFileSets: "pass" | "fail" | "not-assessed";
  gameProvenance: "pass" | "fail" | "not-assessed";
  originalBundleMatch: "not-assessed"; originalPlanMatch: "not-assessed"; originalBeforeStateMatch: "not-assessed";
  broadTokenHistory: "not-assessed"; repairEligibility: "not-assessed";
};

const hash = /^[0-9a-f]{64}$/;
export function isCompletionEvidence(value: unknown): value is CompletionEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const groups = {
    hashes: ["operationSnapshotSha256", "entitySnapshotSha256", "originalComparableSha256"],
    nullable: ["planReceipt", "beforeStateSha256", "storedScopeHashesSha256"],
    fields: ["terminalReceiptState", "readBackShaState"],
    checks: ["approvedBeforeStateSelfConsistency", "completedAtOrder", "planSelfConsistency", "fileContentHashes", "gameFileSets", "gameProvenance"],
    unknown: ["originalBundleMatch", "originalPlanMatch", "originalBeforeStateMatch", "broadTokenHistory", "repairEligibility"],
  };
  const keys = ["schemaVersion", "snapshot", "assessment", "completedAtState", ...Object.values(groups).flat()];
  return Object.keys(v).sort().join(",") === keys.sort().join(",")
    && v.schemaVersion === 1 && v.snapshot === "single-statement" && ["unique", "not-assessed"].includes(String(v.assessment))
    && groups.hashes.every(k => typeof v[k] === "string" && hash.test(v[k]))
    && groups.nullable.every(k => v[k] === null || typeof v[k] === "string" && hash.test(v[k]))
    && groups.fields.every(k => ["absent", "valid-sha256", "malformed", "not-assessed"].includes(String(v[k])))
    && ["absent", "valid-timestamp", "malformed", "not-assessed"].includes(String(v.completedAtState))
    && groups.checks.every(k => ["pass", "fail", "not-assessed"].includes(String(v[k])))
    && groups.unknown.every(k => v[k] === "not-assessed");
}
