export const supportThreadStatuses = [
  "open",
  "in-progress",
  "waiting-user",
  "resolved",
  "closed",
] as const;

export type SupportThreadStatus = (typeof supportThreadStatuses)[number];
export type SupportThreadAuthor = "admin" | "requester";
export const supportReplyDeliveryStatuses = [
  "pending",
  "sent",
  "failed",
  "not-required",
] as const;
export type SupportReplyDeliveryStatus =
  (typeof supportReplyDeliveryStatuses)[number];

export type SupportThreadMessage = {
  id: string;
  requestId: string;
  author: SupportThreadAuthor;
  body: string;
  createdAt: number;
  deliveryStatus: SupportReplyDeliveryStatus;
};

export function isSupportThreadStatus(
  value: unknown,
): value is SupportThreadStatus {
  return typeof value === "string"
    && supportThreadStatuses.includes(value as SupportThreadStatus);
}

export function normalizeSupportThreadMessages(
  value: unknown,
): SupportThreadMessage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const input = entry as Partial<SupportThreadMessage>;
    if (
      typeof input.id !== "string"
      || !input.id.startsWith("message_")
      || typeof input.requestId !== "string"
      || !input.requestId
      || (input.author !== "admin" && input.author !== "requester")
      || typeof input.body !== "string"
      || !input.body
      || !Number.isFinite(input.createdAt)
    ) return [];
    return [{
      id: input.id,
      requestId: input.requestId,
      author: input.author,
      body: input.body,
      createdAt: Number(input.createdAt),
      deliveryStatus: supportReplyDeliveryStatuses.includes(
        input.deliveryStatus as SupportReplyDeliveryStatus,
      )
        ? input.deliveryStatus as SupportReplyDeliveryStatus
        : "not-required",
    }];
  }).sort((left, right) => left.createdAt - right.createdAt);
}
