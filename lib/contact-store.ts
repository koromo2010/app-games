import { randomUUID } from "node:crypto";
import { redisCommand } from "@/lib/redis-store";

export type ContactCategory = "general" | "privacy" | "account" | "bug";
export async function saveContactMessage(input: { category: ContactCategory; name: string; email: string; message: string }) {
  const contact = { id: `contact_${randomUUID()}`, ...input, createdAt: Date.now() };
  await redisCommand<number>(["EVAL", "redis.call('SET',KEYS[1],ARGV[1]); redis.call('LPUSH',KEYS[2],ARGV[2]); redis.call('LTRIM',KEYS[2],0,999); return 1", "2", `contact:v1:${contact.id}`, "contacts:v1", JSON.stringify(contact), contact.id]);
  return { id: contact.id, createdAt: contact.createdAt };
}
