import { sdkServiceHeaders } from "@/lib/sdk-service-auth";

export type CreatorSupportStatus =
  | "open"
  | "in-progress"
  | "waiting-user"
  | "resolved"
  | "closed";

export type CreatorSupportMessage = {
  id: string;
  requestId: string;
  author: "admin" | "requester";
  body: string;
  createdAt: number;
  deliveryStatus: "pending" | "sent" | "failed" | "not-required";
};

export type CreatorSupportReport = {
  id: string;
  type: "bug" | "request";
  summary: string;
  details: string;
  page: string;
  status: CreatorSupportStatus;
  messages: CreatorSupportMessage[];
  createdAt: number;
  updatedAt: number;
};

export type CreatorSupportDraft = {
  id: string;
  playerId: string;
  type: "bug" | "request";
  summary: string;
  details: string;
  page: string;
  createdAt: number;
  expiresAt: number;
};

export type CreatorSupportReplyDraft = {
  id: string;
  playerId: string;
  reportId: string;
  message: string;
  createdAt: number;
  expiresAt: number;
  approvedAt?: number;
};

function appBaseUrl() {
  return process.env.GAME_FIELDS_APP_BASE_URL?.replace(/\/$/, "")
    ?? (
      process.env.VERCEL_GIT_COMMIT_REF === "main"
        ? "https://www.game-fields.com"
        : "https://dev.game-fields.com"
    );
}

async function supportRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: object,
) {
  const url = `${appBaseUrl()}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      ...sdkServiceHeaders(method, url),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null) as T & {
    error?: string;
  } | null;
  if (!response.ok || !data) {
    throw new Error(data?.error || "SUPPORT_SERVICE_UNAVAILABLE");
  }
  return data;
}

export async function listCreatorSupportReports(playerId: string) {
  const query = new URLSearchParams({ playerId });
  const data = await supportRequest<{ reports: CreatorSupportReport[] }>(
    "GET",
    `/api/internal/sdk-support?${query.toString()}`,
  );
  return data.reports;
}

export async function loadCreatorSupportReport(
  playerId: string,
  reportId: string,
) {
  const query = new URLSearchParams({ playerId, reportId });
  const data = await supportRequest<{ report: CreatorSupportReport }>(
    "GET",
    `/api/internal/sdk-support?${query.toString()}`,
  );
  return data.report;
}

export async function replyToCreatorSupportReport(input: {
  playerId: string;
  reportId: string;
  requestId: string;
  message: string;
}) {
  const data = await supportRequest<{ report: CreatorSupportReport }>(
    "POST",
    "/api/internal/sdk-support",
    input,
  );
  return data.report;
}

export async function prepareCreatorSupportDraft(input: {
  playerId: string;
  requestId: string;
  type: "bug" | "request";
  summary: string;
  details: string;
  page: string;
}) {
  const data = await supportRequest<{ draft: CreatorSupportDraft }>(
    "POST",
    "/api/internal/sdk-support",
    { action: "create-draft", ...input },
  );
  return data.draft;
}

export async function prepareCreatorSupportReplyDraft(input: {
  playerId: string;
  reportId: string;
  requestId: string;
  message: string;
}) {
  const data = await supportRequest<{ draft: CreatorSupportReplyDraft }>(
    "POST",
    "/api/internal/sdk-support",
    { action: "create-reply-draft", ...input },
  );
  return data.draft;
}

export async function loadCreatorSupportDraft(
  playerId: string,
  draftId: string,
) {
  const query = new URLSearchParams({ playerId, draftId });
  return supportRequest<
    | { state: "draft"; draft: CreatorSupportDraft }
    | { state: "approved"; report: CreatorSupportReport }
  >(
    "GET",
    `/api/internal/sdk-support?${query.toString()}`,
  );
}

export async function approveCreatorSupportDraft(input: {
  playerId: string;
  draftId: string;
  type: "bug" | "request";
  summary: string;
  details: string;
  page: string;
}) {
  const data = await supportRequest<{ report: CreatorSupportReport }>(
    "POST",
    "/api/internal/sdk-support",
    { action: "approve-draft", ...input },
  );
  return data.report;
}

export async function loadCreatorSupportReplyDraft(
  playerId: string,
  replyDraftId: string,
) {
  const query = new URLSearchParams({ playerId, replyDraftId });
  return supportRequest<
    | {
      state: "draft";
      draft: CreatorSupportReplyDraft;
      report: CreatorSupportReport;
    }
    | {
      state: "approved";
      draft: CreatorSupportReplyDraft;
      report: CreatorSupportReport;
    }
  >(
    "GET",
    `/api/internal/sdk-support?${query.toString()}`,
  );
}

export async function approveCreatorSupportReplyDraft(input: {
  playerId: string;
  replyDraftId: string;
  message: string;
}) {
  const data = await supportRequest<{ report: CreatorSupportReport }>(
    "POST",
    "/api/internal/sdk-support",
    { action: "approve-reply-draft", ...input },
  );
  return data.report;
}
