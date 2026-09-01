import { onlineRoomListMaximumClientRequests } from "./online-room-policy.ts";

export type OnlineRoomDiscoveryItem = {
  code: string;
  roomGenerationId: string;
  updatedAt?: number;
};

export type OnlineRoomDiscoveryPage<Item extends OnlineRoomDiscoveryItem> = {
  rooms: Item[];
  nextCursor: string | null;
};

export type OnlineRoomDiscoveryOptions = {
  cursor?: string | null;
  maximumRequests?: number;
  signal?: AbortSignal;
};

export class OnlineRoomDiscoveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "OnlineRoomDiscoveryError";
    this.code = code;
  }
}

const activeOnlineRoomDiscoveryControllers = new Set<AbortController>();
let onlineRoomDiscoveryEpoch = 0;

export function currentOnlineRoomDiscoveryEpoch() {
  return onlineRoomDiscoveryEpoch;
}

export function trackOnlineRoomDiscovery(controller: AbortController) {
  activeOnlineRoomDiscoveryControllers.add(controller);
  return () => activeOnlineRoomDiscoveryControllers.delete(controller);
}

export function abortAllOnlineRoomDiscoveries(reason = "Context invalidated") {
  onlineRoomDiscoveryEpoch += 1;
  for (const controller of activeOnlineRoomDiscoveryControllers) {
    controller.abort(new DOMException(reason, "AbortError"));
  }
  activeOnlineRoomDiscoveryControllers.clear();
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
}

function validOpaqueCursor(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.length <= 256
    && !/[\u0000-\u0020\u007f]/u.test(value);
}

function validatePage<Item extends OnlineRoomDiscoveryItem>(
  page: OnlineRoomDiscoveryPage<Item>,
) {
  if (!page || !Array.isArray(page.rooms)) {
    throw new OnlineRoomDiscoveryError("ROOM_LIST_RESPONSE_INVALID");
  }
  if (page.nextCursor !== null && !validOpaqueCursor(page.nextCursor)) {
    throw new OnlineRoomDiscoveryError("ROOM_LIST_CURSOR_MALFORMED");
  }
  for (const room of page.rooms) {
    if (
      !room
      || typeof room.code !== "string"
      || !room.code.trim()
      || typeof room.roomGenerationId !== "string"
      || !room.roomGenerationId.trim()
      || room.roomGenerationId.length > 128
    ) {
      throw new OnlineRoomDiscoveryError("ROOM_LIST_ITEM_IDENTITY_INVALID");
    }
  }
}

/**
 * Consumes opaque cursors without rewriting them, accumulates every terminal
 * page, and bounds malformed/stalled/cyclic continuations.
 */
export async function consumeOnlineRoomDiscovery<Item extends OnlineRoomDiscoveryItem>(
  namespace: string,
  fetchPage: (cursor: string | null, signal?: AbortSignal) => Promise<OnlineRoomDiscoveryPage<Item>>,
  options: OnlineRoomDiscoveryOptions = {},
) {
  const maximumRequests = options.maximumRequests ?? onlineRoomListMaximumClientRequests;
  if (!Number.isSafeInteger(maximumRequests) || maximumRequests < 1) {
    throw new OnlineRoomDiscoveryError("ROOM_LIST_REQUEST_LIMIT_INVALID");
  }
  if (!namespace.trim()) {
    throw new OnlineRoomDiscoveryError("ROOM_LIST_NAMESPACE_INVALID");
  }

  let cursor = options.cursor ?? null;
  if (cursor !== null && !validOpaqueCursor(cursor)) {
    throw new OnlineRoomDiscoveryError("ROOM_LIST_CURSOR_MALFORMED");
  }
  const seenCursors = new Set<string>(cursor ? [cursor] : []);
  const rooms = new Map<string, Item>();

  for (let requestCount = 0; requestCount < maximumRequests; requestCount += 1) {
    assertNotAborted(options.signal);
    const page = await fetchPage(cursor, options.signal);
    assertNotAborted(options.signal);
    validatePage(page);

    for (const room of page.rooms) {
      const key = `${namespace}\u0000${room.roomGenerationId}`;
      const current = rooms.get(key);
      if (
        !current
        || (Number.isFinite(room.updatedAt) && Number(room.updatedAt) > Number(current.updatedAt ?? -Infinity))
      ) rooms.set(key, room);
    }

    if (page.nextCursor === null) {
      return [...rooms.values()].sort((left, right) => (
        Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0)
      ));
    }
    if (page.nextCursor === cursor) {
      throw new OnlineRoomDiscoveryError("ROOM_LIST_CURSOR_STALLED");
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new OnlineRoomDiscoveryError("ROOM_LIST_CURSOR_CYCLIC_OR_REPEATED");
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new OnlineRoomDiscoveryError("ROOM_LIST_REQUEST_LIMIT_REACHED");
}
