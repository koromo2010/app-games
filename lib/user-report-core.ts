import {
  isSupportThreadStatus,
  normalizeSupportThreadMessages,
  supportThreadStatuses,
  type SupportThreadMessage,
  type SupportThreadStatus,
} from "./support-thread-core.ts";

export type UserReportType = "bug" | "request";
export const userReportStatuses = supportThreadStatuses;
export type UserReportStatus = SupportThreadStatus;

export type UserReport = {
  id: string;
  type: UserReportType;
  summary: string;
  details: string;
  page: string;
  playerId: string;
  status: UserReportStatus;
  messages: SupportThreadMessage[];
  createdAt: number;
  updatedAt: number;
};

function isUserReportType(value: unknown): value is UserReportType {
  return value === "bug" || value === "request";
}

export function isUserReportStatus(value: unknown): value is UserReportStatus {
  return isSupportThreadStatus(value);
}

export function normalizeStoredUserReport(value: unknown): UserReport | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<UserReport>;
  if (
    typeof input.id !== "string"
    || !input.id.startsWith("report_")
    || !isUserReportType(input.type)
    || typeof input.summary !== "string"
    || typeof input.details !== "string"
    || typeof input.page !== "string"
    || typeof input.playerId !== "string"
    || !Number.isFinite(input.createdAt)
  ) return null;
  const createdAt = Number(input.createdAt);
  return {
    id: input.id,
    type: input.type,
    summary: input.summary,
    details: input.details,
    page: input.page,
    playerId: input.playerId,
    status: isUserReportStatus(input.status) ? input.status : "open",
    messages: normalizeSupportThreadMessages(input.messages),
    createdAt,
    updatedAt: Number.isFinite(input.updatedAt) ? Number(input.updatedAt) : createdAt,
  };
}
