import { onlineRoomListPageSize } from "./online-room-policy.ts";
import { redisCommand } from "./redis-store.ts";

export function normalizeOnlineRoomListCursor(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) return "0";
  return value;
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
  const nextCursor = String(result?.[0] ?? "0");
  const codes = Array.isArray(result?.[1]) ? result[1].filter((code): code is string => typeof code === "string") : [];
  return { codes, nextCursor: nextCursor === "0" ? null : nextCursor };
}

export async function loadOnlineRoomValues(codes: string[], roomKey: (code: string) => string) {
  if (codes.length === 0) return [];
  return redisCommand<(string | null)[]>(["MGET", ...codes.map(roomKey)]);
}
