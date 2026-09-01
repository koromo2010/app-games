import {
  onlineRoomListMaximumScanPages,
  onlineRoomListPageSize,
} from "./online-room-policy.ts";
import { isMultiplayerRoomExpired } from "./multiplayer-room-lifecycle.ts";
import { redisCommand } from "./redis-store.ts";

export function normalizeOnlineRoomListCursor(value: unknown) {
  if (value === null || value === undefined || value === "") return "0";
  const cursor = typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : value;
  if (typeof cursor !== "string" || !/^\d{1,20}$/.test(cursor)) {
    throw new Error("ONLINE_ROOM_LIST_CURSOR_INVALID");
  }
  return cursor;
}

export async function scanOnlineRoomCodes(indexKey: string, cursorValue: unknown) {
  const cursor = normalizeOnlineRoomListCursor(cursorValue);
  const result = await redisCommand<[string | number, string[]]>([
    "SSCAN",
    indexKey,
    cursor,
    "COUNT",
    String(onlineRoomListPageSize),
  ]);
  if (!Array.isArray(result) || result.length < 2 || !Array.isArray(result[1])) {
    throw new Error("ONLINE_ROOM_LIST_SCAN_RESPONSE_INVALID");
  }
  const nextCursor = normalizeOnlineRoomListCursor(result[0]);
  const codes = Array.isArray(result?.[1]) ? result[1].filter((code): code is string => typeof code === "string") : [];
  return { codes, nextCursor: nextCursor === "0" ? null : nextCursor };
}

export async function loadOnlineRoomValues(codes: string[], roomKey: (code: string) => string) {
  if (codes.length === 0) return [];
  return redisCommand<(string | null)[]>(["MGET", ...codes.map(roomKey)]);
}

type IndexedOnlineRoomListOptions<Room extends { updatedAt: number }> = {
  indexKey: string;
  roomKey: (code: string) => string;
  parseRoom: (raw: string | null) => Room | null;
  loadRoom: (code: string) => Promise<Room | null>;
};

export type OnlineRoomListIdentity = {
  roomGenerationId: string;
};

type FilteredIndexedOnlineRoomListOptions<
  Room extends { updatedAt: number },
  Choice,
> = IndexedOnlineRoomListOptions<Room> & {
  selectRoom: (room: Room) => Choice | null;
  identity: (choice: Choice) => string;
  pageSize?: number;
  maximumScanPages?: number;
};

export async function loadIndexedOnlineRoomPage<Room extends { updatedAt: number }>(
  cursor: unknown,
  options: IndexedOnlineRoomListOptions<Room>,
) {
  const page = await scanOnlineRoomCodes(options.indexKey, cursor);
  const values = await loadOnlineRoomValues(page.codes, options.roomKey);
  const rooms = values.map(options.parseRoom);
  const expiredCodes = page.codes.filter((_, index) => rooms[index] && isMultiplayerRoomExpired(rooms[index]!.updatedAt));
  const missingCodes = page.codes.filter((_, index) => !rooms[index]);
  if (expiredCodes.length > 0) await Promise.all(expiredCodes.map(options.loadRoom));
  if (missingCodes.length > 0) await redisCommand<number>(["SREM", options.indexKey, ...missingCodes]);
  return { rooms, nextCursor: page.nextCursor };
}

/**
 * Builds one truthful logical page after application filters. Redis SSCAN order
 * is intentionally unspecified; callers must not use it as a priority signal.
 */
export async function loadFilteredIndexedOnlineRoomPage<
  Room extends { updatedAt: number },
  Choice,
>(
  cursor: unknown,
  options: FilteredIndexedOnlineRoomListOptions<Room, Choice>,
) {
  const pageSize = options.pageSize ?? onlineRoomListPageSize;
  const maximumScanPages = options.maximumScanPages ?? onlineRoomListMaximumScanPages;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new Error("ONLINE_ROOM_LIST_PAGE_SIZE_INVALID");
  }
  if (!Number.isSafeInteger(maximumScanPages) || maximumScanPages < 1) {
    throw new Error("ONLINE_ROOM_LIST_SCAN_LIMIT_INVALID");
  }

  let currentCursor = normalizeOnlineRoomListCursor(cursor);
  const seenCursors = new Set([currentCursor]);
  const seenRooms = new Set<string>();
  const rooms: Choice[] = [];

  for (let scanCount = 0; scanCount < maximumScanPages; scanCount += 1) {
    const page = await loadIndexedOnlineRoomPage(currentCursor, options);
    for (const room of page.rooms) {
      if (!room) continue;
      const choice = options.selectRoom(room);
      if (!choice) continue;
      const identity = options.identity(choice);
      if (!identity || seenRooms.has(identity)) continue;
      seenRooms.add(identity);
      rooms.push(choice);
    }

    if (page.nextCursor === null) return { rooms, nextCursor: null };
    if (page.nextCursor === currentCursor) {
      throw new Error("ONLINE_ROOM_LIST_CURSOR_STALLED");
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new Error("ONLINE_ROOM_LIST_CURSOR_CYCLIC");
    }
    if (rooms.length >= pageSize) {
      return { rooms, nextCursor: page.nextCursor };
    }
    seenCursors.add(page.nextCursor);
    currentCursor = page.nextCursor;
  }

  return { rooms, nextCursor: currentCursor };
}
