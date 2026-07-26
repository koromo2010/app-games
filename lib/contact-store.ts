import { randomUUID } from "node:crypto";
import { redisCommand } from "@/lib/redis-store";
import {
  normalizeStoredContactMessage,
  type ContactCategory,
  type ContactMessage,
  type ContactNotificationStatus,
  type ContactStatus,
} from "@/lib/contact-core";

export type { ContactCategory, ContactMessage, ContactNotificationStatus, ContactStatus } from "@/lib/contact-core";

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

export async function saveContactMessage(input: { category: ContactCategory; name: string; email: string; message: string }) {
  const now = Date.now();
  const contact: ContactMessage = {
    id: `contact_${randomUUID()}`,
    ...input,
    status: "open",
    notificationStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
  await redisCommand<number>([
    "EVAL",
    "redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); redis.call('LPUSH',KEYS[2],ARGV[2]); local removed=redis.call('LRANGE',KEYS[2],ARGV[4],-1); redis.call('LTRIM',KEYS[2],0,ARGV[5]); local prefix=string.sub(KEYS[1],1,string.len(KEYS[1])-string.len(ARGV[2])); for _,id in ipairs(removed) do redis.call('DEL',prefix..id) end; return 1",
    "2",
    `${contactKeyPrefix}${contact.id}`,
    contactIndexKey,
    JSON.stringify(contact),
    contact.id,
    String(contactRetentionSeconds),
    String(contactMaximumCount),
    String(contactMaximumCount - 1),
  ]);
  return { id: contact.id, createdAt: contact.createdAt };
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
  const current = parseStoredContactMessage(await redisCommand<string | null>(["GET", key]));
  if (!current) throw new Error("CONTACT_MESSAGE_NOT_FOUND");
  const updated = update(current);
  await redisCommand<string>(["SET", key, JSON.stringify(updated), "EX", String(contactRetentionSeconds)]);
  return updated;
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
) {
  return updateContactMessage(contactId, (current) => ({
    ...current,
    notificationStatus,
    updatedAt: Date.now(),
  }));
}
