import { randomUUID } from "node:crypto";
import { redisCommand } from "./redis-store.ts";
import {
  type SupportReplyDeliveryStatus,
  type SupportThreadAuthor,
} from "./support-thread-core.ts";
import {
  normalizeStoredUserReport,
  type UserReport,
  type UserReportNotificationStatus,
  type UserReportStatus,
  type UserReportType,
} from "./user-report-core.ts";

export type { UserReport, UserReportStatus, UserReportType } from "./user-report-core.ts";

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

export async function saveUserReport(
  input: {
    type: UserReportType;
    summary: string;
    details: string;
    page: string;
    playerId: string;
  },
  options: { reportId?: string } = {},
) {
  const now = Date.now();
  const reportId = options.reportId ?? `report_${randomUUID()}`;
  if (!/^report_[0-9a-f-]{36}$/i.test(reportId)) {
    throw new Error("USER_REPORT_ID_INVALID");
  }
  const report: UserReport = {
    id: reportId,
    ...input,
    status: "open",
    notificationStatus: "pending",
    notificationErrorCode: null,
    notificationAttemptedAt: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await redisCommand<number>([
    "EVAL",
    "if redis.call('EXISTS',KEYS[1])==1 then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); redis.call('LPUSH',KEYS[2],ARGV[2]); local removed=redis.call('LRANGE',KEYS[2],ARGV[4],-1); redis.call('LTRIM',KEYS[2],0,ARGV[5]); local prefix=string.sub(KEYS[1],1,string.len(KEYS[1])-string.len(ARGV[2])); for _,id in ipairs(removed) do redis.call('DEL',prefix..id) end; return 1",
    "2",
    `${userReportKeyPrefix}${report.id}`,
    userReportIndexKey,
    JSON.stringify(report),
    report.id,
    String(userReportRetentionSeconds),
    String(userReportMaximumCount),
    String(userReportMaximumCount - 1),
  ]);
  if (inserted === 0) {
    const existing = await loadUserReport(report.id);
    if (!existing || existing.playerId !== input.playerId) {
      throw new Error("USER_REPORT_ID_CONFLICT");
    }
    return {
      id: existing.id,
      createdAt: existing.createdAt,
      inserted: false,
    };
  }
  return { id: report.id, createdAt: report.createdAt, inserted: true };
}

export async function loadUserReport(reportId: string) {
  if (!/^report_[0-9a-f-]{36}$/i.test(reportId)) return null;
  return parseStoredUserReport(
    await redisCommand<string | null>([
      "GET",
      `${userReportKeyPrefix}${reportId}`,
    ]),
  );
}

async function readIndexedUserReports() {
  const ids = await redisCommand<string[]>(["LRANGE", userReportIndexKey, "0", String(userReportMaximumCount - 1)]);
  if (!ids.length) return [];
  const values = await redisCommand<Array<string | null>>(["MGET", ...ids.map((id) => `${userReportKeyPrefix}${id}`)]);
  const reports = values.map(parseStoredUserReport).filter((report): report is UserReport => report !== null);
  return reports
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function listUserReports(limit = 100) {
  const safeLimit = Math.max(1, Math.min(200, Math.round(limit)));
  return (await readIndexedUserReports()).slice(0, safeLimit);
}

export async function listUserReportsForPlayer(
  playerIdInput: string,
  limit = 100,
) {
  const playerId = playerIdInput.trim();
  if (!playerId) return [];
  return (await readIndexedUserReports())
    .filter((report) => report.playerId === playerId)
    .slice(0, Math.max(1, Math.min(200, Math.round(limit))));
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

async function updateUserReport(
  reportId: string,
  update: (current: UserReport) => UserReport,
) {
  if (!/^report_[0-9a-f-]{36}$/i.test(reportId)) throw new Error("USER_REPORT_NOT_FOUND");
  const key = `${userReportKeyPrefix}${reportId}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const raw = await redisCommand<string | null>(["GET", key]);
    const current = parseStoredUserReport(raw);
    if (!raw || !current) throw new Error("USER_REPORT_NOT_FOUND");
    const updated = update(current);
    const saved = await redisCommand<number>([
      "EVAL",
      "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 end return 0",
      "1",
      key,
      raw,
      JSON.stringify(updated),
      String(userReportRetentionSeconds),
    ]);
    if (saved === 1) return updated;
  }
  throw new Error("USER_REPORT_CONFLICT");
}

export async function updateUserReportStatus(
  reportId: string,
  status: UserReportStatus,
) {
  return updateUserReport(reportId, (current) => ({
    ...current,
    status,
    updatedAt: Date.now(),
  }));
}

export async function updateUserReportNotificationStatus(
  reportId: string,
  notificationStatus: UserReportNotificationStatus,
  notificationErrorCode: string | null = null,
) {
  return updateUserReport(reportId, (current) => ({
    ...current,
    notificationStatus,
    notificationErrorCode,
    notificationAttemptedAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

export async function appendUserReportMessage(input: {
  reportId: string;
  playerId?: string;
  requestId: string;
  author: SupportThreadAuthor;
  body: string;
  status: UserReportStatus;
  deliveryStatus?: SupportReplyDeliveryStatus;
}) {
  if (!/^report_[0-9a-f-]{36}$/i.test(input.reportId)) {
    throw new Error("USER_REPORT_NOT_FOUND");
  }
  const key = `${userReportKeyPrefix}${input.reportId}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const raw = await redisCommand<string | null>(["GET", key]);
    const current = parseStoredUserReport(raw);
    if (!raw || !current) throw new Error("USER_REPORT_NOT_FOUND");
    if (input.playerId && current.playerId !== input.playerId) {
      throw new Error("USER_REPORT_FORBIDDEN");
    }
    const existing = current.messages.find(
      (message) => message.requestId === input.requestId,
    );
    if (existing) return { report: current, message: existing, inserted: false };
    const now = Date.now();
    const message = {
      id: `message_${randomUUID()}`,
      requestId: input.requestId,
      author: input.author,
      body: input.body,
      createdAt: now,
      deliveryStatus: input.deliveryStatus ?? "not-required",
    } as const;
    const updated: UserReport = {
      ...current,
      status: input.status,
      ...(input.author === "requester"
        ? {
          notificationStatus: "pending" as const,
          notificationErrorCode: null,
          notificationAttemptedAt: null,
        }
        : {}),
      messages: [...current.messages, message],
      updatedAt: now,
    };
    const saved = await redisCommand<number>([
      "EVAL",
      "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 end return 0",
      "1",
      key,
      raw,
      JSON.stringify(updated),
      String(userReportRetentionSeconds),
    ]);
    if (saved === 1) return { report: updated, message, inserted: true };
  }
  throw new Error("USER_REPORT_CONFLICT");
}

export async function updateUserReportMessageDelivery(
  reportId: string,
  messageId: string,
  deliveryStatus: SupportReplyDeliveryStatus,
) {
  return updateUserReport(reportId, (current) => ({
    ...current,
    messages: current.messages.map((message) => message.id === messageId
      ? { ...message, deliveryStatus }
      : message),
    updatedAt: Date.now(),
  }));
}
