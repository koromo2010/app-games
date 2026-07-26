import { redisCommand } from "@/lib/redis-store";
import {
  loadUserReport,
  saveUserReport,
  type UserReport,
  type UserReportType,
} from "@/lib/user-report-store";

export type UserReportDraft = {
  id: string;
  playerId: string;
  type: UserReportType;
  summary: string;
  details: string;
  page: string;
  createdAt: number;
  expiresAt: number;
};

const draftKeyPrefix = "user-report-draft:v1:";
const draftRetentionSeconds = 7 * 24 * 60 * 60;
const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseDraft(value: string | null) {
  if (!value) return null;
  try {
    const input = JSON.parse(value) as Partial<UserReportDraft>;
    if (
      typeof input.id !== "string"
      || !input.id.startsWith("draft_")
      || typeof input.playerId !== "string"
      || !input.playerId
      || (input.type !== "bug" && input.type !== "request")
      || typeof input.summary !== "string"
      || typeof input.details !== "string"
      || typeof input.page !== "string"
      || !Number.isFinite(input.createdAt)
      || !Number.isFinite(input.expiresAt)
    ) return null;
    return input as UserReportDraft;
  } catch {
    return null;
  }
}

function draftKey(draftId: string) {
  return `${draftKeyPrefix}${draftId}`;
}

function reportIdForDraft(draftId: string) {
  return `report_${draftId.slice("draft_".length)}`;
}

export async function saveUserReportDraft(input: {
  playerId: string;
  requestId: string;
  type: UserReportType;
  summary: string;
  details: string;
  page: string;
}) {
  if (!requestIdPattern.test(input.requestId)) {
    throw new Error("USER_REPORT_DRAFT_REQUEST_ID_INVALID");
  }
  const now = Date.now();
  const draft: UserReportDraft = {
    id: `draft_${input.requestId.toLowerCase()}`,
    playerId: input.playerId,
    type: input.type,
    summary: input.summary,
    details: input.details,
    page: input.page,
    createdAt: now,
    expiresAt: now + draftRetentionSeconds * 1_000,
  };
  const inserted = await redisCommand<"OK" | null>([
    "SET",
    draftKey(draft.id),
    JSON.stringify(draft),
    "EX",
    String(draftRetentionSeconds),
    "NX",
  ]);
  if (inserted === "OK") return draft;
  const existing = await loadUserReportDraft(draft.id, input.playerId);
  if (!existing) throw new Error("USER_REPORT_DRAFT_CONFLICT");
  return existing;
}

export async function loadUserReportDraft(
  draftId: string,
  playerId: string,
) {
  if (!/^draft_[0-9a-f-]{36}$/i.test(draftId)) return null;
  const draft = parseDraft(
    await redisCommand<string | null>(["GET", draftKey(draftId)]),
  );
  return draft?.playerId === playerId ? draft : null;
}

export async function loadApprovedUserReportForDraft(
  draftId: string,
  playerId: string,
) {
  if (!/^draft_[0-9a-f-]{36}$/i.test(draftId)) return null;
  const report = await loadUserReport(reportIdForDraft(draftId));
  return report?.playerId === playerId ? report : null;
}

export async function approveUserReportDraft(input: {
  draftId: string;
  playerId: string;
  type: UserReportType;
  summary: string;
  details: string;
  page: string;
}): Promise<UserReport> {
  const existing = await loadApprovedUserReportForDraft(
    input.draftId,
    input.playerId,
  );
  if (existing) return existing;
  const draft = await loadUserReportDraft(input.draftId, input.playerId);
  if (!draft) throw new Error("USER_REPORT_DRAFT_NOT_FOUND");
  const saved = await saveUserReport({
    playerId: input.playerId,
    type: input.type,
    summary: input.summary,
    details: input.details,
    page: input.page,
  }, {
    reportId: reportIdForDraft(input.draftId),
  });
  const report = await loadUserReport(saved.id);
  if (!report) throw new Error("USER_REPORT_DRAFT_APPROVAL_FAILED");
  await redisCommand<number>(["DEL", draftKey(input.draftId)]);
  return report;
}

export async function deleteUserReportDraftsForPlayer(playerId: string) {
  let cursor = "0";
  let deleted = 0;
  do {
    const page = await redisCommand<[string, string[]]>([
      "SCAN",
      cursor,
      "MATCH",
      `${draftKeyPrefix}*`,
      "COUNT",
      "100",
    ]);
    cursor = page[0];
    for (const key of page[1]) {
      const draft = parseDraft(
        await redisCommand<string | null>(["GET", key]),
      );
      if (draft?.playerId !== playerId) continue;
      deleted += await redisCommand<number>(["DEL", key]);
    }
  } while (cursor !== "0");
  return deleted;
}
