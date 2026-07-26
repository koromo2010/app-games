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
export const userReportNotificationStatuses = [
  "pending",
  "sent",
  "failed",
  "unknown",
] as const;
export type UserReportNotificationStatus =
  (typeof userReportNotificationStatuses)[number];

export type UserReport = {
  id: string;
  type: UserReportType;
  summary: string;
  details: string;
  page: string;
  playerId: string;
  status: UserReportStatus;
  notificationStatus: UserReportNotificationStatus;
  notificationErrorCode: string | null;
  notificationAttemptedAt: number | null;
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

export function isUserReportNotificationStatus(
  value: unknown,
): value is UserReportNotificationStatus {
  return typeof value === "string"
    && userReportNotificationStatuses.includes(
      value as UserReportNotificationStatus,
    );
}

function normalizeNotificationErrorCode(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{2,79}$/.test(value)
    ? value
    : null;
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
    notificationStatus: isUserReportNotificationStatus(
      input.notificationStatus,
    )
      ? input.notificationStatus
      : "unknown",
    notificationErrorCode: normalizeNotificationErrorCode(
      input.notificationErrorCode,
    ),
    notificationAttemptedAt: Number.isFinite(input.notificationAttemptedAt)
      ? Number(input.notificationAttemptedAt)
      : null,
    messages: normalizeSupportThreadMessages(input.messages),
    createdAt,
    updatedAt: Number.isFinite(input.updatedAt) ? Number(input.updatedAt) : createdAt,
  };
}
