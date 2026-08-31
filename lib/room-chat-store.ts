import { createHash, randomUUID } from "node:crypto";
import { redisCommand } from "./redis-store.ts";
import { createRoomChatCursor, parseRoomChatCursor, roomChatSchemaVersion, type RoomChatMessage } from "./room-chat-contract.ts";
import { roomChatRetention } from "./room-chat-policy.ts";

type StoredRoomChatMessage = Omit<RoomChatMessage, "sequence" | "orderCursor">;
type StreamEntry = [string, string[]];

export type RoomChatStoreDriver = {
  append(input: { scope: string; dedupeKey: string; record: StoredRoomChatMessage; ttlSeconds: number; maximumMessages: number }): Promise<{ entryId: string; record: StoredRoomChatMessage; inserted: boolean }>;
  page(input: { scope: string; afterId: string | null; limit: number }): Promise<{ entries: Array<{ entryId: string; record: StoredRoomChatMessage }>; hasMore: boolean; cursorFound: boolean }>;
  delete(scope: string): Promise<void>;
};

const appendScript = `
local prior=redis.call('HGET',KEYS[2],ARGV[1])
if prior then return {0,prior} end
local id=redis.call('XADD',KEYS[1],'MAXLEN','~',ARGV[4],'*','d',ARGV[2])
local saved=cjson.encode({id=id,record=ARGV[2]})
redis.call('HSET',KEYS[2],ARGV[1],saved)
redis.call('EXPIRE',KEYS[1],ARGV[3])
redis.call('EXPIRE',KEYS[2],ARGV[3])
return {1,saved}
`;

function keys(scope: string) {
  return { stream: `room-chat:v1:${scope}:messages`, dedupe: `room-chat:v1:${scope}:dedupe` };
}

function streamRecord(fields: string[]) {
  for (let index = 0; index + 1 < fields.length; index += 2) {
    if (fields[index] === "d") return JSON.parse(fields[index + 1]!) as StoredRoomChatMessage;
  }
  throw new Error("ROOM_CHAT_ENTRY_INVALID");
}

export const redisRoomChatStoreDriver: RoomChatStoreDriver = {
  async append(input) {
    const key = keys(input.scope);
    const result = await redisCommand<[number, string]>([
      "EVAL", appendScript, "2", key.stream, key.dedupe, input.dedupeKey,
      JSON.stringify(input.record), String(input.ttlSeconds), String(input.maximumMessages),
    ]);
    const saved = JSON.parse(result[1]) as { id: string; record: string };
    return { entryId: saved.id, record: JSON.parse(saved.record), inserted: Number(result[0]) === 1 };
  },
  async page(input) {
    const key = keys(input.scope);
    const cursorFound = input.afterId
      ? (await redisCommand<StreamEntry[]>(["XRANGE", key.stream, input.afterId, input.afterId, "COUNT", "1"])).length === 1
      : true;
    if (!cursorFound) return { entries: [], hasMore: false, cursorFound: false };
    const start = input.afterId ? `(${input.afterId}` : "-";
    const raw = await redisCommand<StreamEntry[]>(["XRANGE", key.stream, start, "+", "COUNT", String(input.limit + 1)]);
    return {
      entries: raw.slice(0, input.limit).map(([entryId, fields]) => ({ entryId, record: streamRecord(fields) })),
      hasMore: raw.length > input.limit,
      cursorFound: true,
    };
  },
  async delete(scope) {
    const key = keys(scope);
    await redisCommand<number>(["DEL", key.stream, key.dedupe]);
  },
};

export function roomChatScope(environment: string, game: string, roomInstanceId: string) {
  return createHash("sha256").update(`${environment}:${game}:${roomInstanceId}`).digest("hex").slice(0, 40);
}

export function roomChatSenderRef(roomInstanceId: string, actorId: string) {
  return createHash("sha256").update(`room-chat-sender:${roomInstanceId}:${actorId}`).digest("base64url").slice(0, 20);
}

export function createRoomChatStore(driver: RoomChatStoreDriver = redisRoomChatStoreDriver, env: NodeJS.ProcessEnv = process.env) {
  return {
    async append(input: { scope: string; roomInstanceId: string; actorId: string; requestId: string; body: string; expiresAt: number; now?: number }) {
      const now = input.now ?? Date.now();
      const ttlSeconds = Math.max(1, Math.min(roomChatRetention.maximumAgeSeconds, Math.ceil((input.expiresAt - now) / 1_000)));
      const record: StoredRoomChatMessage = {
        schemaVersion: roomChatSchemaVersion,
        messageId: randomUUID(),
        roomInstanceId: input.roomInstanceId,
        kind: "user",
        senderRef: roomChatSenderRef(input.roomInstanceId, input.actorId),
        body: input.body,
        createdAt: now,
      };
      const saved = await driver.append({
        scope: input.scope,
        dedupeKey: `${record.senderRef}:${input.requestId}`,
        record,
        ttlSeconds,
        maximumMessages: roomChatRetention.maximumMessages,
      });
      return { ...saved.record, sequence: saved.entryId, orderCursor: createRoomChatCursor(input.roomInstanceId, saved.entryId, env), inserted: saved.inserted };
    },
    async page(input: { scope: string; roomInstanceId: string; cursor?: unknown; limit?: number }) {
      const afterId = parseRoomChatCursor(input.cursor, input.roomInstanceId, env);
      if (afterId === undefined) return { error: "ROOM_CHAT_INVALID_REQUEST" as const };
      const limit = Math.max(1, Math.min(input.limit ?? roomChatRetention.pageSize, 100));
      const page = await driver.page({ scope: input.scope, afterId, limit });
      if (!page.cursorFound) return { error: "ROOM_CHAT_CURSOR_EXPIRED" as const };
      const messages = page.entries.map(({ entryId, record }) => ({ ...record, sequence: entryId, orderCursor: createRoomChatCursor(input.roomInstanceId, entryId, env) }));
      return { messages, hasMore: page.hasMore, nextCursor: messages.at(-1)?.orderCursor ?? (typeof input.cursor === "string" ? input.cursor : null) };
    },
    delete: driver.delete,
  };
}
