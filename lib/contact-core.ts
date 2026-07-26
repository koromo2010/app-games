export const contactCategories = ["general", "privacy", "account", "bug"] as const;
export type ContactCategory = (typeof contactCategories)[number];
export const contactStatuses = ["open", "in-progress", "resolved", "closed"] as const;
export type ContactStatus = (typeof contactStatuses)[number];
export const contactNotificationStatuses = ["pending", "sent", "failed", "unknown"] as const;
export type ContactNotificationStatus = (typeof contactNotificationStatuses)[number];

export type ContactMessage = {
  id: string;
  category: ContactCategory;
  name: string;
  email: string;
  message: string;
  status: ContactStatus;
  notificationStatus: ContactNotificationStatus;
  createdAt: number;
  updatedAt: number;
};

export function isContactCategory(value: unknown): value is ContactCategory {
  return typeof value === "string" && contactCategories.includes(value as ContactCategory);
}

export function isContactStatus(value: unknown): value is ContactStatus {
  return typeof value === "string" && contactStatuses.includes(value as ContactStatus);
}

export function isContactNotificationStatus(value: unknown): value is ContactNotificationStatus {
  return typeof value === "string" && contactNotificationStatuses.includes(value as ContactNotificationStatus);
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
    status: isContactStatus(input.status) ? input.status : "open",
    notificationStatus: isContactNotificationStatus(input.notificationStatus) ? input.notificationStatus : "unknown",
    createdAt,
    updatedAt: Number.isFinite(input.updatedAt) ? Number(input.updatedAt) : createdAt,
  };
}
