import { multiplayerRoomExpiryArgs, multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import { publishOnlineRoomRevision } from "./online-room-realtime-server.ts";
import type { OnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";
import { schedulePostResponseWork } from "./post-response-work.ts";
import { redisCommand } from "./redis-store.ts";

export async function compareAndSetOnlineRoom<Room extends { code: string }>(
  expectedRevision: number,
  room: Room,
  roomKey: (code: string) => string,
  activeRoomKeys: string[] = [],
) {
  const keys = [roomKey(room.code), ...new Set(activeRoomKeys.filter(Boolean))];
  return redisCommand<number>([
    "EVAL",
    "local raw=redis.call('GET',KEYS[1]); if not raw then return -1 end; local current=cjson.decode(raw); if tonumber(current.revision or 0)~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3]); for i=2,#KEYS do redis.call('SET',KEYS[i],ARGV[4],'EX',ARGV[3]) end; return 1",
    String(keys.length),
    ...keys,
    String(expectedRevision),
    JSON.stringify(room),
    String(multiplayerRoomTtlSeconds),
    room.code,
  ]);
}

export async function createIndexedOnlineRoom<Room extends { code: string }>(room: Room, options: {
  roomKey: (code: string) => string;
  roomIndexKey: string;
  activeRoomKeys?: (room: Room) => string[];
  conflictError: string;
}) {
  const activeRoomKeys = [...new Set(options.activeRoomKeys?.(room).filter(Boolean) ?? [])];
  const keys = [options.roomKey(room.code), options.roomIndexKey, ...activeRoomKeys];
  const saved = await redisCommand<number>([
    "EVAL",
    "if redis.call('EXISTS',KEYS[1])==1 then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2]); redis.call('SADD',KEYS[2],ARGV[3]); for i=3,#KEYS do redis.call('SET',KEYS[i],ARGV[3],'EX',ARGV[2]) end; return 1",
    String(keys.length),
    ...keys,
    JSON.stringify(room),
    multiplayerRoomExpiryArgs()[1],
    room.code,
  ]);
  if (saved !== 1) throw new Error(options.conflictError);
}

type RevisionedOnlineRoom = { code: string; revision: number; updatedAt: number };

/**
 * Reapplies a logical mutation after a revision conflict.
 *
 * Use this when a game already owns its save/CAS boundary but still needs the
 * shared online-room guarantee that concurrent commands are not silently lost.
 * Returning the current room from `mutate` marks the command as already applied.
 */
export async function reapplyOnlineRoomMutationWithRetry<Room extends RevisionedOnlineRoom>(options: {
  code: string;
  loadRoom: (code: string) => Promise<Room | null>;
  mutate: (room: Room) => Room | Promise<Room>;
  saveRoom: (room: Room) => Promise<Room>;
  errors: { notFound: string; conflict: string };
  maxAttempts?: number;
}) {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 6);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const current = await options.loadRoom(options.code);
    if (!current) throw new Error(options.errors.notFound);
    const changed = await options.mutate(current);
    if (changed === current) return { room: current, applied: false };
    try {
      const saved = await options.saveRoom({
        ...changed,
        revision: current.revision + 1,
        updatedAt: Date.now(),
      });
      return { room: saved, applied: true };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== options.errors.conflict) throw error;
    }
  }
  throw new Error(options.errors.conflict);
}

export async function mutateOnlineRoomWithRetry<Room extends RevisionedOnlineRoom>(options: {
  code: string;
  roomKey: (code: string) => string;
  loadRoom: (code: string) => Promise<Room | null>;
  mutate: (room: Room) => Room | Promise<Room>;
  normalize: (room: unknown) => Room | null;
  prepare?: (current: Room, changed: Room, context: { revision: number; timestamp: number }) => Room;
  activeRoomKeys?: (room: Room) => string[];
  afterSave?: (room: Room) => Promise<unknown>;
  realtimeGame?: OnlineRoomRealtimeGame;
  errors: { notFound: string; invalid: string; conflict: string };
}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await options.loadRoom(options.code);
    if (!current) throw new Error(options.errors.notFound);
    const changed = await options.mutate(current);
    if (changed === current) return current;
    const revision = current.revision + 1;
    const timestamp = Date.now();
    const prepared = options.prepare?.(current, changed, { revision, timestamp }) ?? changed;
    const next = options.normalize({ ...prepared, revision, updatedAt: timestamp });
    if (!next) throw new Error(options.errors.invalid);
    const saved = await compareAndSetOnlineRoom(current.revision, next, options.roomKey, options.activeRoomKeys?.(next));
    if (saved === 1) {
      if (options.realtimeGame) {
        await schedulePostResponseWork(
          `online-room-realtime:${options.realtimeGame}:${next.code}`,
          () => publishOnlineRoomRevision(options.realtimeGame!, next),
          { outsideRequest: "skip" },
        );
      }
      if (options.afterSave) {
        await schedulePostResponseWork(`online-room:${next.code}`, () => options.afterSave!(next));
      }
      return next;
    }
    if (saved === -1) throw new Error(options.errors.notFound);
  }
  throw new Error(options.errors.conflict);
}
