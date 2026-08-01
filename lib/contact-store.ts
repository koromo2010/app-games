import { randomUUID } from "node:crypto";
import { redisCommand } from "./redis-store.ts";
import {
  type SupportReplyDeliveryStatus,
  type SupportThreadAuthor,
} from "./support-thread-core.ts";
import {
  normalizeStoredContactMessage,
  type ContactCategory,
  type ContactMessage,
  type ContactNotificationStatus,
  type ContactStatus,
} from "./contact-core.ts";
import { validateSupportText } from "../config/support-text-contract.ts";

export type { ContactCategory, ContactMessage, ContactNotificationStatus, ContactStatus } from "./contact-core.ts";

const contactIndexKey = "contacts:v1";
const contactKeyPrefix = "contact:v1:";
const contactMaximumCount = 1_000;
const contactRetentionSeconds = 365 * 24 * 60 * 60;

function parseStoredContactMessage(value: string | null) {
  if (!value) return null;
  try {
    return normalizeStoredContactMessage(JSON.parse(value));
  } catch {
    return null;
  }
}

export async function saveContactMessage(input: {
  category: ContactCategory;
  name: string;
  email: string;
  message: string;
  playerId?: string | null;
}, options: { contactId?: string } = {}) {
  const validatedMessage = validateSupportText(
    input.message,
    "reply",
    { required: true },
  );
  const now = Date.now();
  const contactId = options.contactId ?? `contact_${randomUUID()}`;
  if (!/^contact_[0-9a-f-]{36}$/i.test(contactId)) {
    throw new Error("CONTACT_MESSAGE_ID_INVALID");
  }
  const contact: ContactMessage = {
    id: contactId,
    ...input,
    message: validatedMessage,
    playerId: input.playerId?.trim() || null,
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
    `${contactKeyPrefix}${contact.id}`,
    contactIndexKey,
    JSON.stringify(contact),
    contact.id,
    String(contactRetentionSeconds),
    String(contactMaximumCount),
    String(contactMaximumCount - 1),
  ]);
  if (inserted === 0) {
    const existing = await loadContactMessage(contact.id);
    if (
      !existing
      || existing.category !== contact.category
      || existing.name !== contact.name
      || existing.email !== contact.email
      || existing.message !== contact.message
      || existing.playerId !== contact.playerId
    ) {
      throw new Error("CONTACT_MESSAGE_ID_CONFLICT");
    }
    return {
      id: existing.id,
      createdAt: existing.createdAt,
      inserted: false,
    };
  }
  return { id: contact.id, createdAt: contact.createdAt, inserted: true };
}

export async function loadContactMessage(contactId: string) {
  if (!/^contact_[0-9a-f-]{36}$/i.test(contactId)) return null;
  return parseStoredContactMessage(
    await redisCommand<string | null>(["GET", `${contactKeyPrefix}${contactId}`]),
  );
}

export async function listContactMessages(limit = 100) {
  const safeLimit = Math.max(1, Math.min(200, Math.round(limit)));
  const ids = await redisCommand<string[]>(["LRANGE", contactIndexKey, "0", String(contactMaximumCount - 1)]);
  if (!ids.length) return [];
  const values = await redisCommand<Array<string | null>>(["MGET", ...ids.map((id) => `${contactKeyPrefix}${id}`)]);
  const contacts = values.map(parseStoredContactMessage).filter((contact): contact is ContactMessage => contact !== null);
  return contacts
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, safeLimit);
}

async function updateContactMessage(
  contactId: string,
  update: (current: ContactMessage) => ContactMessage,
) {
  if (!/^contact_[0-9a-f-]{36}$/i.test(contactId)) throw new Error("CONTACT_MESSAGE_NOT_FOUND");
  const key = `${contactKeyPrefix}${contactId}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const raw = await redisCommand<string | null>(["GET", key]);
    const current = parseStoredContactMessage(raw);
    if (!raw || !current) throw new Error("CONTACT_MESSAGE_NOT_FOUND");
    const updated = update(current);
    const saved = await redisCommand<number>([
      "EVAL",
      "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1 end return 0",
      "1",
      key,
      raw,
      JSON.stringify(updated),
      String(contactRetentionSeconds),
    ]);
    if (saved === 1) return updated;
  }
  throw new Error("CONTACT_MESSAGE_CONFLICT");
}

export async function updateContactMessageStatus(contactId: string, status: ContactStatus) {
  return updateContactMessage(contactId, (current) => ({
    ...current,
    status,
    updatedAt: Date.now(),
  }));
}

export async function updateContactNotificationStatus(
  contactId: string,
  notificationStatus: ContactNotificationStatus,
  notificationErrorCode: string | null = null,
) {
  return updateContactMessage(contactId, (current) => ({
    ...current,
    notificationStatus,
    notificationErrorCode,
    notificationAttemptedAt: Date.now(),
    updatedAt: Date.now(),
  }));
}

export async function appendContactThreadMessage(input: {
  contactId: string;
  requestId: string;
  author: SupportThreadAuthor;
  body: string;
  status: ContactStatus;
  deliveryStatus?: SupportReplyDeliveryStatus;
}) {
  const body = validateSupportText(input.body, "reply", { required: true });
  if (!/^contact_[0-9a-f-]{36}$/i.test(input.contactId)) {
    throw new Error("CONTACT_MESSAGE_NOT_FOUND");
  }
  const key = `${contactKeyPrefix}${input.contactId}`;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const raw = await redisCommand<string | null>(["GET", key]);
    const current = parseStoredContactMessage(raw);
    if (!raw || !current) throw new Error("CONTACT_MESSAGE_NOT_FOUND");
    const existing = current.messages.find(
      (message) => message.requestId === input.requestId,
    );
    if (existing) {
      if (existing.author !== input.author || existing.body !== body) {
        throw new Error("CONTACT_MESSAGE_REQUEST_ID_CONFLICT");
      }
      return { contact: current, message: existing, inserted: false };
    }
    const now = Date.now();
    const message = {
      id: `message_${randomUUID()}`,
      requestId: input.requestId,
      author: input.author,
      body,
      createdAt: now,
      deliveryStatus: input.deliveryStatus ?? "not-required",
    } as const;
    const updated: ContactMessage = {
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
      String(contactRetentionSeconds),
    ]);
    if (saved === 1) return { contact: updated, message, inserted: true };
  }
  throw new Error("CONTACT_MESSAGE_CONFLICT");
}

export async function updateContactThreadMessageDelivery(
  contactId: string,
  messageId: string,
  deliveryStatus: SupportReplyDeliveryStatus,
) {
  return updateContactMessage(contactId, (current) => ({
    ...current,
    messages: current.messages.map((message) => message.id === messageId
      ? { ...message, deliveryStatus }
      : message),
    updatedAt: Date.now(),
  }));
}
