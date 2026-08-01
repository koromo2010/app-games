import { redisCommand } from "@/lib/redis-store";
import {
  appendUserReportMessage,
  loadUserReport,
  saveUserReport,
  type UserReport,
  type UserReportType,
} from "@/lib/user-report-store";
import {
  validateSupportReportText,
  validateSupportText,
} from "@/config/support-text-contract";

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

export type UserReportReplyDraft = {
  id: string;
  playerId: string;
  reportId: string;
  message: string;
  createdAt: number;
  expiresAt: number;
  approvedAt?: number;
};

const draftKeyPrefix = "user-report-draft:v1:";
const replyDraftKeyPrefix = "user-report-reply-draft:v1:";
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

function parseReplyDraft(value: string | null) {
  if (!value) return null;
  try {
    const input = JSON.parse(value) as Partial<UserReportReplyDraft>;
    if (
      typeof input.id !== "string"
      || !/^reply_draft_[0-9a-f-]{36}$/i.test(input.id)
      || typeof input.playerId !== "string"
      || !input.playerId
      || typeof input.reportId !== "string"
      || !/^report_[0-9a-f-]{36}$/i.test(input.reportId)
      || typeof input.message !== "string"
      || !input.message
      || !Number.isFinite(input.createdAt)
      || !Number.isFinite(input.expiresAt)
      || (
        input.approvedAt !== undefined
        && !Number.isFinite(input.approvedAt)
      )
    ) return null;
    return input as UserReportReplyDraft;
  } catch {
    return null;
  }
}

function replyDraftKey(draftId: string) {
  return `${replyDraftKeyPrefix}${draftId}`;
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
  const text = validateSupportReportText(input);
  if (!requestIdPattern.test(input.requestId)) {
    throw new Error("USER_REPORT_DRAFT_REQUEST_ID_INVALID");
  }
  const now = Date.now();
  const draft: UserReportDraft = {
    id: `draft_${input.requestId.toLowerCase()}`,
    playerId: input.playerId,
    type: input.type,
    ...text,
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
  if (
    !existing
    || existing.type !== input.type
    || existing.summary !== text.summary
    || existing.details !== text.details
    || existing.page !== text.page
  ) throw new Error("USER_REPORT_DRAFT_CONFLICT");
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
  const text = validateSupportReportText(input);
  const existing = await loadApprovedUserReportForDraft(
    input.draftId,
    input.playerId,
  );
  if (existing) {
    if (
      existing.type !== input.type
      || existing.summary !== text.summary
      || existing.details !== text.details
      || existing.page !== text.page
    ) throw new Error("USER_REPORT_DRAFT_APPROVAL_CONFLICT");
    return existing;
  }
  const draft = await loadUserReportDraft(input.draftId, input.playerId);
  if (!draft) throw new Error("USER_REPORT_DRAFT_NOT_FOUND");
  const saved = await saveUserReport({
    playerId: input.playerId,
    type: input.type,
    ...text,
  }, {
    reportId: reportIdForDraft(input.draftId),
  });
  const report = await loadUserReport(saved.id);
  if (!report) throw new Error("USER_REPORT_DRAFT_APPROVAL_FAILED");
  await redisCommand<number>(["DEL", draftKey(input.draftId)]);
  return report;
}

export async function saveUserReportReplyDraft(input: {
  playerId: string;
  reportId: string;
  requestId: string;
  message: string;
}) {
  const message = validateSupportText(input.message, "reply", { required: true });
  if (!requestIdPattern.test(input.requestId)) {
    throw new Error("USER_REPORT_REPLY_DRAFT_REQUEST_ID_INVALID");
  }
  const report = await loadUserReport(input.reportId);
  if (!report || report.playerId !== input.playerId) {
    throw new Error("USER_REPORT_NOT_FOUND");
  }
  const now = Date.now();
  const draft: UserReportReplyDraft = {
    id: `reply_draft_${input.requestId.toLowerCase()}`,
    playerId: input.playerId,
    reportId: input.reportId,
    message,
    createdAt: now,
    expiresAt: now + draftRetentionSeconds * 1_000,
  };
  const inserted = await redisCommand<"OK" | null>([
    "SET",
    replyDraftKey(draft.id),
    JSON.stringify(draft),
    "EX",
    String(draftRetentionSeconds),
    "NX",
  ]);
  if (inserted === "OK") return draft;
  const existing = await loadUserReportReplyDraft(draft.id, input.playerId);
  if (
    !existing
    || existing.reportId !== input.reportId
    || existing.message !== message
  ) {
    throw new Error("USER_REPORT_REPLY_DRAFT_CONFLICT");
  }
  return existing;
}

export async function loadUserReportReplyDraft(
  draftId: string,
  playerId: string,
) {
  if (!/^reply_draft_[0-9a-f-]{36}$/i.test(draftId)) return null;
  const draft = parseReplyDraft(
    await redisCommand<string | null>(["GET", replyDraftKey(draftId)]),
  );
  return draft?.playerId === playerId ? draft : null;
}

export async function approveUserReportReplyDraft(input: {
  draftId: string;
  playerId: string;
  message: string;
}) {
  const message = validateSupportText(input.message, "reply", { required: true });
  const draft = await loadUserReportReplyDraft(
    input.draftId,
    input.playerId,
  );
  if (!draft) throw new Error("USER_REPORT_REPLY_DRAFT_NOT_FOUND");
  const result = await appendUserReportMessage({
    reportId: draft.reportId,
    playerId: input.playerId,
    requestId: `approved-${draft.id.slice("reply_draft_".length)}`,
    author: "requester",
    body: message,
    status: "open",
  });
  if (!draft.approvedAt || draft.message !== result.message.body) {
    const approvedDraft: UserReportReplyDraft = {
      ...draft,
      message: result.message.body,
      approvedAt: Date.now(),
    };
    const remainingRetentionSeconds = Math.max(
      1,
      Math.ceil((draft.expiresAt - Date.now()) / 1_000),
    );
    await redisCommand<"OK">([
      "SET",
      replyDraftKey(draft.id),
      JSON.stringify(approvedDraft),
      "EX",
      String(remainingRetentionSeconds),
    ]);
  }
  return result;
}

export async function deleteUserReportDraftsForPlayer(playerId: string) {
  let deleted = 0;
  for (const input of [
    { prefix: draftKeyPrefix, parse: parseDraft },
    { prefix: replyDraftKeyPrefix, parse: parseReplyDraft },
  ]) {
    let cursor = "0";
    do {
      const page = await redisCommand<[string, string[]]>([
        "SCAN",
        cursor,
        "MATCH",
        `${input.prefix}*`,
        "COUNT",
        "100",
      ]);
      cursor = page[0];
      for (const key of page[1]) {
        const draft = input.parse(
          await redisCommand<string | null>(["GET", key]),
        );
        if (draft?.playerId !== playerId) continue;
        deleted += await redisCommand<number>(["DEL", key]);
      }
    } while (cursor !== "0");
  }
  return deleted;
}
