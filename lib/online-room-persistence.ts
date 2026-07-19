import { multiplayerRoomExpiryArgs, multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import { schedulePostResponseWork } from "./post-response-work.ts";
import { redisCommand } from "./redis-store.ts";

export async function compareAndSetOnlineRoom<Room extends { code: string }>(
  expectedRevision: number,
  room: Room,
  roomKey: (code: string) => string,
) {
  return redisCommand<number>([
    "EVAL",
    "local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local current=cjson.decode(raw); if tonumber(current.revision or 0)~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); return 1",
    "1",
    roomKey(room.code),
    String(expectedRevision),
    JSON.stringify(room),
    String(multiplayerRoomTtlSeconds),
  ]);
}

export async function createIndexedOnlineRoom<Room extends { code: string }>(room: Room, options: {
  roomKey: (code: string) => string;
  roomIndexKey: string;
  conflictError: string;
}) {
  const saved = await redisCommand<"OK" | null>([
    "SET", options.roomKey(room.code), JSON.stringify(room), "NX", ...multiplayerRoomExpiryArgs(),
  ]);
  if (saved !== "OK") throw new Error(options.conflictError);
  await redisCommand<number>(["SADD", options.roomIndexKey, room.code]);
}

type RevisionedOnlineRoom = { code: string; revision: number; updatedAt: number };

export async function mutateOnlineRoomWithRetry<Room extends RevisionedOnlineRoom>(options: {
  code: string;
  roomKey: (code: string) => string;
  loadRoom: (code: string) => Promise<Room | null>;
  mutate: (room: Room) => Room;
  normalize: (room: unknown) => Room | null;
  prepare?: (current: Room, changed: Room, context: { revision: number; timestamp: number }) => Room;
  afterSave?: (room: Room) => Promise<unknown>;
  errors: { notFound: string; invalid: string; conflict: string };
}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await options.loadRoom(options.code);
    if (!current) throw new Error(options.errors.notFound);
    const changed = options.mutate(current);
    if (changed === current) return current;
    const revision = current.revision + 1;
    const timestamp = Date.now();
    const prepared = options.prepare?.(current, changed, { revision, timestamp }) ?? changed;
    const next = options.normalize({ ...prepared, revision, updatedAt: timestamp });
    if (!next) throw new Error(options.errors.invalid);
    const saved = await compareAndSetOnlineRoom(current.revision, next, options.roomKey);
    if (saved === 1) {
      if (options.afterSave) {
        await schedulePostResponseWork(`online-room:${next.code}`, () => options.afterSave!(next));
      }
      return next;
    }
    if (saved === -1) throw new Error(options.errors.notFound);
  }
  throw new Error(options.errors.conflict);
}
