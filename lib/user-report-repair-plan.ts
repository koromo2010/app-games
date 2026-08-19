import { createHash } from "node:crypto";
import {
  type UserReportStorageAudit,
  userReportRetentionSeconds,
} from "./user-report-storage-audit.ts";

export type UserReportRepairEnvironment = "production" | "development";

export type UserReportRepairAction =
  | {
    kind: "REBUILD_INDEX";
    currentIds: string[];
    desiredIds: string[];
  }
  | {
    kind: "RESET_BODY_TTL";
    reportId: string;
    currentTtlSeconds: number | null;
    desiredTtlSeconds: number;
  }
  | {
    kind: "MANUAL_REVIEW_MALFORMED_BODY";
    reportId: string;
  };

function sameIds(left: string[], right: string[]) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

export function createUserReportRepairDryRun(
  environment: UserReportRepairEnvironment,
  audit: UserReportStorageAudit,
) {
  const desiredIds = audit.reports.map((report) => report.id);
  const actions: UserReportRepairAction[] = [];
  if (!sameIds(audit.indexIds, desiredIds)) {
    actions.push({
      kind: "REBUILD_INDEX",
      currentIds: [...audit.indexIds],
      desiredIds,
    });
  }
  for (const record of [...audit.records].sort((left, right) => (
    left.reportId.localeCompare(right.reportId)
  ))) {
    if (record.classifications.includes("BODY_MALFORMED")) {
      actions.push({
        kind: "MANUAL_REVIEW_MALFORMED_BODY",
        reportId: record.reportId,
      });
    } else if (
      record.classifications.includes("BODY_TTL_ANOMALY")
      && record.parseStatus === "valid"
    ) {
      actions.push({
        kind: "RESET_BODY_TTL",
        reportId: record.reportId,
        currentTtlSeconds: record.ttlSeconds,
        desiredTtlSeconds: userReportRetentionSeconds,
      });
    }
  }
  const blockedReasons = [
    ...(audit.bodyScanTruncated ? ["BODY_SCAN_TRUNCATED"] : []),
    ...(audit.indexTruncated ? ["INDEX_TRUNCATED"] : []),
    ...(audit.inventoryLimitReached ? ["INVENTORY_LIMIT_REACHED"] : []),
    ...(audit.invalidBodyKeyCount > 0 ? ["BODY_KEY_INVALID"] : []),
    ...(audit.invalidIndexEntryCount > 0 ? ["INDEX_ENTRY_INVALID"] : []),
    ...(audit.records.some((record) => record.parseStatus === "malformed")
      ? ["MALFORMED_BODY_REQUIRES_MANUAL_REVIEW"]
      : []),
  ].sort();
  const unsigned = {
    schemaVersion: 1 as const,
    mode: "dry-run" as const,
    environment,
    writesPerformed: 0 as const,
    applySupported: false as const,
    authorizationRequired: true as const,
    auditComplete: audit.complete,
    safeToAuthorize: blockedReasons.length === 0,
    blockedReasons,
    actions,
  };
  return {
    ...unsigned,
    planSha256: createHash("sha256")
      .update(JSON.stringify(unsigned))
      .digest("hex"),
  };
}
