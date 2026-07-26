import {
  isSupportThreadStatus,
  normalizeSupportThreadMessages,
  supportThreadStatuses,
  type SupportThreadMessage,
  type SupportThreadStatus,
} from "./support-thread-core.ts";

export const contactCategories = ["general", "privacy", "account", "bug"] as const;
export type ContactCategory = (typeof contactCategories)[number];
export const contactStatuses = supportThreadStatuses;
export type ContactStatus = SupportThreadStatus;
export const contactNotificationStatuses = ["pending", "sent", "failed", "unknown"] as const;
export type ContactNotificationStatus = (typeof contactNotificationStatuses)[number];

export type ContactMessage = {
  id: string;
  category: ContactCategory;
  name: string;
  email: string;
  message: string;
  playerId: string | null;
  status: ContactStatus;
  notificationStatus: ContactNotificationStatus;
  notificationErrorCode: string | null;
  notificationAttemptedAt: number | null;
  messages: SupportThreadMessage[];
  createdAt: number;
  updatedAt: number;
};

export function isContactCategory(value: unknown): value is ContactCategory {
  return typeof value === "string" && contactCategories.includes(value as ContactCategory);
}

export function isContactStatus(value: unknown): value is ContactStatus {
  return isSupportThreadStatus(value);
}

export function isContactNotificationStatus(value: unknown): value is ContactNotificationStatus {
  return typeof value === "string" && contactNotificationStatuses.includes(value as ContactNotificationStatus);
}

function normalizeNotificationErrorCode(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{2,79}$/.test(value)
    ? value
    : null;
}

export function normalizeStoredContactMessage(value: unknown): ContactMessage | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ContactMessage>;
  if (
    typeof input.id !== "string"
    || !input.id.startsWith("contact_")
    || !isContactCategory(input.category)
    || typeof input.name !== "string"
    || typeof input.email !== "string"
    || typeof input.message !== "string"
    || !Number.isFinite(input.createdAt)
  ) return null;
  const createdAt = Number(input.createdAt);
  return {
    id: input.id,
    category: input.category,
    name: input.name,
    email: input.email,
    message: input.message,
    playerId: typeof input.playerId === "string" && input.playerId
      ? input.playerId
      : null,
    status: isContactStatus(input.status) ? input.status : "open",
    notificationStatus: isContactNotificationStatus(input.notificationStatus) ? input.notificationStatus : "unknown",
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
