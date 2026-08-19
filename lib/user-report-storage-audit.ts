import { redisCommand, redisPipeline } from "./redis-store.ts";
import {
  normalizeStoredUserReport,
  type UserReport,
} from "./user-report-core.ts";

export const userReportIndexKey = "user-reports:v1";
export const userReportKeyPrefix = "user-report:v1:";
export const userReportMaximumCount = 1_000;
export const userReportRetentionSeconds = 180 * 24 * 60 * 60;

const userReportScanCount = 100;
const userReportScanPageLimit = 100;
const userReportReadBatchSize = 100;
const reportIdPattern = /^report_[0-9a-f-]{36}$/i;

export type UserReportStorageClassification =
  | "BODY_AND_INDEX_OK"
  | "BODY_PRESENT_INDEX_MISSING"
  | "INDEX_PRESENT_BODY_MISSING"
  | "INDEX_DUPLICATE"
  | "BODY_MALFORMED"
  | "BODY_TTL_ANOMALY"
  | "CROSS_ENVIRONMENT_DUPLICATE_ID";

export type UserReportStorageWarningCode =
  | Exclude<UserReportStorageClassification, "BODY_AND_INDEX_OK">
  | "BODY_SCAN_TRUNCATED"
  | "INDEX_TRUNCATED"
  | "INVENTORY_LIMIT_REACHED"
  | "BODY_KEY_INVALID"
  | "INDEX_ENTRY_INVALID"
  | "REPORT_NOT_FOUND";

export type UserReportStorageWarning = {
  code: UserReportStorageWarningCode;
  reportId?: string;
  count?: number;
};

export type UserReportStorageRecord = {
  reportId: string;
  bodyPresent: boolean;
  parseStatus: "valid" | "malformed" | "missing";
  ttlSeconds: number | null;
  indexPositions: number[];
  classifications: UserReportStorageClassification[];
  report: UserReport | null;
};

export type UserReportStorageAudit = {
  schemaVersion: 1;
  bounds: {
    maximumReports: number;
    maximumIndexEntries: number;
    maximumScanPages: number;
    scanCount: number;
  };
  complete: boolean;
  bodyScanTruncated: boolean;
  indexTruncated: boolean;
  inventoryLimitReached: boolean;
  scannedPages: number;
  indexIds: string[];
  invalidBodyKeyCount: number;
  invalidIndexEntryCount: number;
  records: UserReportStorageRecord[];
  reports: UserReport[];
  warnings: UserReportStorageWarning[];
};

export type SafeUserReportStorageRecord = Omit<
  UserReportStorageRecord,
  "report"
> & {
  status: UserReport["status"] | null;
  createdAt: number | null;
  updatedAt: number | null;
  messageCount: number;
  lastAuthor: UserReport["messages"][number]["author"] | null;
  notificationStatus: UserReport["notificationStatus"] | null;
  notificationAttemptedAt: number | null;
};

export type SafeUserReportStorageAudit = Omit<
  UserReportStorageAudit,
  "records" | "reports"
> & {
  records: SafeUserReportStorageRecord[];
};

type UserReportStorageReader = {
  command: <T>(command: unknown[]) => Promise<T>;
  pipeline: <T extends unknown[]>(commands: unknown[][]) => Promise<T>;
};

const defaultReader: UserReportStorageReader = {
  command: redisCommand,
  pipeline: redisPipeline,
};

function reportIdFromBodyKey(key: string) {
  const marker = key.lastIndexOf(userReportKeyPrefix);
  if (marker < 0) return null;
  const reportId = key.slice(marker + userReportKeyPrefix.length);
  return reportIdPattern.test(reportId) ? reportId : null;
}

function parseStoredUserReport(value: string | null, reportId: string) {
  if (!value) return null;
  try {
    const report = normalizeStoredUserReport(JSON.parse(value));
    return report?.id === reportId ? report : null;
  } catch {
    return null;
  }
}

export function compareUserReportsByUpdatedAt(
  left: UserReport,
  right: UserReport,
) {
  return right.updatedAt - left.updatedAt
    || right.createdAt - left.createdAt
    || left.id.localeCompare(right.id);
}

function storageClassifications(input: {
  bodyPresent: boolean;
  parseStatus: UserReportStorageRecord["parseStatus"];
  ttlSeconds: number | null;
  includeTtl: boolean;
  indexPositions: number[];
}) {
  const classifications: UserReportStorageClassification[] = [];
  const ttlAnomaly = input.includeTtl
    && input.bodyPresent
    && (
      input.ttlSeconds === null
      || input.ttlSeconds < 1
      || input.ttlSeconds > userReportRetentionSeconds
    );
  if (
    input.bodyPresent
    && input.parseStatus === "valid"
    && input.indexPositions.length === 1
    && !ttlAnomaly
  ) {
    classifications.push("BODY_AND_INDEX_OK");
  }
  if (input.bodyPresent && input.indexPositions.length === 0) {
    classifications.push("BODY_PRESENT_INDEX_MISSING");
  }
  if (!input.bodyPresent && input.indexPositions.length > 0) {
    classifications.push("INDEX_PRESENT_BODY_MISSING");
  }
  if (input.indexPositions.length > 1) {
    classifications.push("INDEX_DUPLICATE");
  }
  if (input.bodyPresent && input.parseStatus === "malformed") {
    classifications.push("BODY_MALFORMED");
  }
  if (ttlAnomaly) {
    classifications.push("BODY_TTL_ANOMALY");
  }
  return classifications;
}

async function readBodyBatch(
  reader: UserReportStorageReader,
  bodyKeys: string[],
  includeTtl: boolean,
) {
  const commands: unknown[][] = [
    ["MGET", ...bodyKeys],
    ...(includeTtl ? bodyKeys.map((key) => ["TTL", key]) : []),
  ];
  const result = await reader.pipeline<unknown[]>(commands);
  const values = Array.isArray(result[0])
    ? result[0] as Array<string | null>
    : bodyKeys.map(() => null);
  const ttls = includeTtl
    ? result.slice(1).map((value) => Number(value))
    : bodyKeys.map(() => null);
  return { values, ttls };
}

export async function auditUserReportStorage(options: {
  includeTtl?: boolean;
  reader?: UserReportStorageReader;
  maximumReports?: number;
  maximumScanPages?: number;
} = {}): Promise<UserReportStorageAudit> {
  const reader = options.reader ?? defaultReader;
  const includeTtl = options.includeTtl ?? true;
  const maximumReports = Math.max(
    1,
    Math.min(userReportMaximumCount, Math.round(
      options.maximumReports ?? userReportMaximumCount,
    )),
  );
  const maximumScanPages = Math.max(
    1,
    Math.min(userReportScanPageLimit, Math.round(
      options.maximumScanPages ?? userReportScanPageLimit,
    )),
  );

  const rawIndex = await reader.command<unknown[]>([
    "LRANGE",
    userReportIndexKey,
    "0",
    String(userReportMaximumCount),
  ]);
  const indexValues = Array.isArray(rawIndex) ? rawIndex : [];
  const indexTruncated = indexValues.length > userReportMaximumCount;
  const boundedIndex = indexValues.slice(0, userReportMaximumCount);
  const invalidIndexEntryCount = boundedIndex.filter(
    (value) => typeof value !== "string" || !reportIdPattern.test(value),
  ).length;
  const validIndexEntries = boundedIndex.flatMap((value, position) => (
    typeof value === "string" && reportIdPattern.test(value)
      ? [{ reportId: value, position }]
      : []
  ));
  const indexIds = validIndexEntries.map(({ reportId }) => reportId);

  const bodyKeys = new Map<string, string>();
  let invalidBodyKeyCount = 0;
  let cursor = "0";
  let scannedPages = 0;
  let bodyScanTruncated = false;
  do {
    const page = await reader.command<[string | number, string[]]>([
      "SCAN",
      cursor,
      "MATCH",
      `${userReportKeyPrefix}*`,
      "COUNT",
      String(userReportScanCount),
    ]);
    scannedPages += 1;
    cursor = String(page?.[0] ?? "0");
    const keys = Array.isArray(page?.[1]) ? [...page[1]].sort() : [];
    for (const key of keys) {
      const reportId = reportIdFromBodyKey(key);
      if (!reportId) {
        invalidBodyKeyCount += 1;
        continue;
      }
      if (bodyKeys.has(reportId)) continue;
      if (bodyKeys.size >= maximumReports) {
        bodyScanTruncated = true;
        break;
      }
      bodyKeys.set(reportId, key);
    }
    if (bodyKeys.size >= maximumReports && cursor !== "0") {
      bodyScanTruncated = true;
      break;
    }
  } while (cursor !== "0" && scannedPages < maximumScanPages);
  if (cursor !== "0") bodyScanTruncated = true;

  const candidateIds = [...bodyKeys.keys()].sort();
  const candidateSet = new Set(candidateIds);
  let inventoryLimitReached = bodyScanTruncated;
  for (const reportId of indexIds) {
    if (candidateSet.has(reportId)) continue;
    if (candidateIds.length >= maximumReports) {
      inventoryLimitReached = true;
      break;
    }
    candidateIds.push(reportId);
    candidateSet.add(reportId);
  }

  const indexPositions = new Map<string, number[]>();
  for (const { position, reportId } of validIndexEntries) {
    const positions = indexPositions.get(reportId) ?? [];
    positions.push(position);
    indexPositions.set(reportId, positions);
  }

  const records: UserReportStorageRecord[] = [];
  for (let offset = 0; offset < candidateIds.length; offset += userReportReadBatchSize) {
    const ids = candidateIds.slice(offset, offset + userReportReadBatchSize);
    const keys = ids.map(
      (reportId) => bodyKeys.get(reportId) ?? `${userReportKeyPrefix}${reportId}`,
    );
    const batch = await readBodyBatch(reader, keys, includeTtl);
    for (const [index, reportId] of ids.entries()) {
      const raw = batch.values[index] ?? null;
      const bodyPresent = raw !== null;
      const report = parseStoredUserReport(raw, reportId);
      const parseStatus = !bodyPresent
        ? "missing" as const
        : report
        ? "valid" as const
        : "malformed" as const;
      const positions = indexPositions.get(reportId) ?? [];
      const ttlValue = includeTtl && Number.isFinite(batch.ttls[index])
        ? Number(batch.ttls[index])
        : null;
      records.push({
        reportId,
        bodyPresent,
        parseStatus,
        ttlSeconds: ttlValue,
        indexPositions: positions,
        classifications: storageClassifications({
          bodyPresent,
          parseStatus,
          ttlSeconds: ttlValue,
          includeTtl,
          indexPositions: positions,
        }),
        report,
      });
    }
  }

  const warnings: UserReportStorageWarning[] = [];
  if (bodyScanTruncated) warnings.push({ code: "BODY_SCAN_TRUNCATED" });
  if (indexTruncated) warnings.push({ code: "INDEX_TRUNCATED" });
  if (inventoryLimitReached) warnings.push({ code: "INVENTORY_LIMIT_REACHED" });
  if (invalidBodyKeyCount > 0) {
    warnings.push({
      code: "BODY_KEY_INVALID",
      count: invalidBodyKeyCount,
    });
  }
  if (invalidIndexEntryCount > 0) {
    warnings.push({
      code: "INDEX_ENTRY_INVALID",
      count: invalidIndexEntryCount,
    });
  }
  for (const record of records) {
    for (const code of record.classifications) {
      if (code !== "BODY_AND_INDEX_OK") {
        warnings.push({ code, reportId: record.reportId });
      }
    }
  }

  const reports = records
    .map((record) => record.report)
    .filter((report): report is UserReport => report !== null)
    .sort(compareUserReportsByUpdatedAt);
  const complete = !bodyScanTruncated
    && !indexTruncated
    && !inventoryLimitReached
    && invalidBodyKeyCount === 0;
  return {
    schemaVersion: 1,
    bounds: {
      maximumReports,
      maximumIndexEntries: userReportMaximumCount,
      maximumScanPages,
      scanCount: userReportScanCount,
    },
    complete,
    bodyScanTruncated,
    indexTruncated,
    inventoryLimitReached,
    scannedPages,
    indexIds,
    invalidBodyKeyCount,
    invalidIndexEntryCount,
    records,
    reports,
    warnings,
  };
}

export async function inspectUserReportStorage(
  reportId: string,
  options: { reader?: UserReportStorageReader } = {},
) {
  if (!reportIdPattern.test(reportId)) {
    throw new Error("USER_REPORT_ID_INVALID");
  }
  const reader = options.reader ?? defaultReader;
  const [raw, ttl, rawIndex] = await reader.pipeline<[
    string | null,
    number,
    unknown[],
  ]>([
    ["GET", `${userReportKeyPrefix}${reportId}`],
    ["TTL", `${userReportKeyPrefix}${reportId}`],
    ["LRANGE", userReportIndexKey, "0", String(userReportMaximumCount)],
  ]);
  const indexValues = Array.isArray(rawIndex) ? rawIndex : [];
  const indexTruncated = indexValues.length > userReportMaximumCount;
  const indexPositions = indexValues
    .slice(0, userReportMaximumCount)
    .flatMap((value, position) => value === reportId ? [position] : []);
  const bodyPresent = raw !== null;
  const report = parseStoredUserReport(raw, reportId);
  const parseStatus = !bodyPresent
    ? "missing" as const
    : report
    ? "valid" as const
    : "malformed" as const;
  const ttlSeconds = Number.isFinite(ttl) ? Number(ttl) : null;
  const record: UserReportStorageRecord = {
    reportId,
    bodyPresent,
    parseStatus,
    ttlSeconds,
    indexPositions,
    classifications: storageClassifications({
      bodyPresent,
      parseStatus,
      ttlSeconds,
      includeTtl: true,
      indexPositions,
    }),
    report,
  };
  return {
    report,
    record,
    indexTruncated,
    warnings: [
      ...(indexTruncated
        ? [{ code: "INDEX_TRUNCATED" as const }]
        : []),
      ...(!bodyPresent && indexPositions.length === 0
        ? [{ code: "REPORT_NOT_FOUND" as const, reportId }]
        : []),
      ...record.classifications
        .filter((code) => code !== "BODY_AND_INDEX_OK")
        .map((code) => ({ code, reportId })),
    ] satisfies UserReportStorageWarning[],
  };
}

function safeRecord(record: UserReportStorageRecord): SafeUserReportStorageRecord {
  const messages = record.report?.messages ?? [];
  return {
    reportId: record.reportId,
    bodyPresent: record.bodyPresent,
    parseStatus: record.parseStatus,
    ttlSeconds: record.ttlSeconds,
    indexPositions: record.indexPositions,
    classifications: record.classifications,
    status: record.report?.status ?? null,
    createdAt: record.report?.createdAt ?? null,
    updatedAt: record.report?.updatedAt ?? null,
    messageCount: messages.length,
    lastAuthor: messages.at(-1)?.author ?? null,
    notificationStatus: record.report?.notificationStatus ?? null,
    notificationAttemptedAt: record.report?.notificationAttemptedAt ?? null,
  };
}

export function safeUserReportStorageAudit(
  audit: UserReportStorageAudit,
): SafeUserReportStorageAudit {
  return {
    schemaVersion: audit.schemaVersion,
    bounds: audit.bounds,
    complete: audit.complete,
    bodyScanTruncated: audit.bodyScanTruncated,
    indexTruncated: audit.indexTruncated,
    inventoryLimitReached: audit.inventoryLimitReached,
    scannedPages: audit.scannedPages,
    indexIds: audit.indexIds,
    invalidBodyKeyCount: audit.invalidBodyKeyCount,
    invalidIndexEntryCount: audit.invalidIndexEntryCount,
    records: audit.records.map(safeRecord),
    warnings: audit.warnings,
  };
}

export function safeUserReportStorageInspection(
  inspection: Awaited<ReturnType<typeof inspectUserReportStorage>>,
) {
  return {
    record: safeRecord(inspection.record),
    indexTruncated: inspection.indexTruncated,
    warnings: inspection.warnings,
  };
}

export function crossEnvironmentDuplicateUserReportIds(
  production: UserReportStorageAudit,
  development: UserReportStorageAudit,
) {
  const developmentBodies = new Set(
    development.records
      .filter((record) => record.bodyPresent)
      .map((record) => record.reportId),
  );
  return production.records
    .filter((record) => (
      record.bodyPresent && developmentBodies.has(record.reportId)
    ))
    .map((record) => record.reportId)
    .sort();
}
