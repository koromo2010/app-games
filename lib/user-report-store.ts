import { randomUUID } from "node:crypto";
import { redisCommand } from "@/lib/redis-store";
import {
  normalizeStoredUserReport,
  type UserReport,
  type UserReportStatus,
  type UserReportType,
} from "@/lib/user-report-core";

export type { UserReport, UserReportStatus, UserReportType } from "@/lib/user-report-core";

const userReportIndexKey = "user-reports:v1";
const userReportKeyPrefix = "user-report:v1:";
const userReportMaximumCount = 1_000;
const userReportRetentionSeconds = 180 * 24 * 60 * 60;

function parseStoredUserReport(value: string | null) {
  if (!value) return null;
  try {
    return normalizeStoredUserReport(JSON.parse(value));
  } catch {
    return null;
  }
}

export async function saveUserReport(input: { type: UserReportType; summary: string; details: string; page: string; playerId: string }) {
  const now = Date.now();
  const report: UserReport = {
    id: `report_${randomUUID()}`,
    ...input,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  await redisCommand<number>([
    "EVAL",
    "redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); redis.call('LPUSH',KEYS[2],ARGV[2]); local removed=redis.call('LRANGE',KEYS[2],ARGV[4],-1); redis.call('LTRIM',KEYS[2],0,ARGV[5]); local prefix=string.sub(KEYS[1],1,string.len(KEYS[1])-string.len(ARGV[2])); for _,id in ipairs(removed) do redis.call('DEL',prefix..id) end; return 1",
    "2",
    `${userReportKeyPrefix}${report.id}`,
    userReportIndexKey,
    JSON.stringify(report),
    report.id,
    String(userReportRetentionSeconds),
    String(userReportMaximumCount),
    String(userReportMaximumCount - 1),
  ]);
  return { id: report.id, createdAt: report.createdAt };
}

export async function listUserReports(limit = 100) {
  const safeLimit = Math.max(1, Math.min(200, Math.round(limit)));
  const ids = await redisCommand<string[]>(["LRANGE", userReportIndexKey, "0", String(userReportMaximumCount - 1)]);
  if (!ids.length) return [];
  const values = await redisCommand<Array<string | null>>(["MGET", ...ids.map((id) => `${userReportKeyPrefix}${id}`)]);
  const reports = values.map(parseStoredUserReport).filter((report): report is UserReport => report !== null);
  return reports
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, safeLimit);
}

export async function deleteUserReportsForPlayer(playerIdInput: string) {
  const playerId = playerIdInput.trim();
  if (!playerId) return 0;
  const ids = await redisCommand<string[]>(["LRANGE", userReportIndexKey, "0", String(userReportMaximumCount - 1)]);
  if (!ids.length) return 0;
  const values = await redisCommand<Array<string | null>>(["MGET", ...ids.map((id) => `${userReportKeyPrefix}${id}`)]);
  const reportIds = values
    .map(parseStoredUserReport)
    .filter((report): report is UserReport => report?.playerId === playerId)
    .map((report) => report.id);
  if (!reportIds.length) return 0;
  return await redisCommand<number>([
    "EVAL",
    "for i=2,#KEYS do redis.call('DEL',KEYS[i]); redis.call('LREM',KEYS[1],0,ARGV[i-1]) end; return #KEYS-1",
    String(reportIds.length + 1),
    userReportIndexKey,
    ...reportIds.map((id) => `${userReportKeyPrefix}${id}`),
    ...reportIds,
  ]);
}

export async function updateUserReportStatus(reportId: string, status: UserReportStatus) {
  if (!/^report_[0-9a-f-]{36}$/i.test(reportId)) throw new Error("USER_REPORT_NOT_FOUND");
  const key = `${userReportKeyPrefix}${reportId}`;
  const current = parseStoredUserReport(await redisCommand<string | null>(["GET", key]));
  if (!current) throw new Error("USER_REPORT_NOT_FOUND");
  const updated: UserReport = { ...current, status, updatedAt: Date.now() };
  await redisCommand<string>(["SET", key, JSON.stringify(updated), "EX", String(userReportRetentionSeconds)]);
  return updated;
}
