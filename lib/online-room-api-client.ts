import { fetchConditionalJson } from "./conditional-json-client.ts";
import {
  consumeOnlineRoomDiscovery,
  currentOnlineRoomDiscoveryEpoch,
  OnlineRoomDiscoveryError,
  trackOnlineRoomDiscovery,
  type OnlineRoomDiscoveryItem,
  type OnlineRoomDiscoveryOptions,
  type OnlineRoomDiscoveryPage,
} from "./online-room-discovery.ts";
import { observeServerDate } from "./server-clock.ts";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type RoomResponse<Room> = { room?: Room | null };
type RoomListResponse<RoomChoice> = {
  rooms?: RoomChoice[];
  nextCursor?: string | null;
};

export class OnlineRoomApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly payload: unknown;
  readonly retryAfterMs: number | null;
  readonly serverDeadlineAt: number | null;

  constructor(code: string, status: number, payload: unknown = null) {
    super(code);
    this.name = "OnlineRoomApiError";
    const details = payload && typeof payload === "object"
      ? payload as {
        error?: unknown;
        errorCode?: unknown;
        retryAfterMs?: unknown;
        serverDeadlineAt?: unknown;
      }
      : null;
    const payloadCode = typeof details?.errorCode === "string"
      ? details.errorCode
      : typeof details?.error === "string"
        && /^[A-Z][A-Z0-9_]{1,79}$/.test(details.error)
        ? details.error
        : null;
    this.code = payloadCode ?? code;
    this.status = status;
    this.payload = payload;
    const retryAfterMs = Number(details?.retryAfterMs);
    const serverDeadlineAt = Number(details?.serverDeadlineAt);
    this.retryAfterMs = Number.isFinite(retryAfterMs) ? retryAfterMs : null;
    this.serverDeadlineAt = Number.isFinite(serverDeadlineAt)
      ? serverDeadlineAt
      : null;
  }
}

type OnlineRoomApiClientOptions<Room> = {
  endpoint: string;
  fetcher?: Fetcher;
  normalizeRoom?: (room: Room) => Room;
};

function queryUrl(endpoint: string, values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${endpoint}?${query}` : endpoint;
}

async function responseJson<T>(response: Response, errorCode: string, requestedAt = Date.now()) {
  observeServerDate(response.headers.get("date"), requestedAt, Date.now());
  const payload = await response.json().catch(() => null) as T | null;
  if (!response.ok) throw new OnlineRoomApiError(errorCode, response.status, payload);
  if (payload === null) throw new OnlineRoomApiError(errorCode, response.status, null);
  return payload;
}

/** Shared typed HTTP boundary for online-room games. Game rules stay in each game's domain module. */
export function createOnlineRoomApiClient<Room, RoomChoice>({
  endpoint,
  fetcher = fetch,
  normalizeRoom = (room) => room,
}: OnlineRoomApiClientOptions<Room>) {
  const normalizeOptionalRoom = (room: Room | null | undefined) => room ? normalizeRoom(room) : null;
  let discoveryController: AbortController | null = null;
  const discoveredRoomGenerations = new Map<string, string>();
  const ambiguousDiscoveredCodes = new Set<string>();
  let discoveryEpoch = -1;

  const fetchJoinableRoomPage = async (
    cursor: string | null = null,
    signal?: AbortSignal,
  ): Promise<OnlineRoomDiscoveryPage<RoomChoice & OnlineRoomDiscoveryItem>> => {
    const requestedAt = Date.now();
    const response = await fetcher(
      queryUrl(endpoint, { cursor: cursor ?? undefined }),
      { cache: "no-store", signal },
    );
    observeServerDate(response.headers.get("date"), requestedAt, Date.now());
    const payload = await response.json().catch(() => null) as RoomListResponse<RoomChoice> | null;
    if (!response.ok) throw new OnlineRoomApiError("ROOM_LIST_FAILED", response.status, payload);
    if (!payload || !Array.isArray(payload.rooms) || !("nextCursor" in payload)) {
      throw new OnlineRoomDiscoveryError("ROOM_LIST_RESPONSE_INVALID");
    }
    return {
      rooms: payload.rooms as Array<RoomChoice & OnlineRoomDiscoveryItem>,
      nextCursor: payload.nextCursor ?? null,
    };
  };

  return {
    async fetchRoom(code: string, playerId?: string) {
      const url = queryUrl(endpoint, { code, playerId });
      const result = await fetchConditionalJson<RoomResponse<Room>>(url, fetcher);
      if (result.status === 404) return null;
      if (!result.ok) throw new OnlineRoomApiError("ROOM_FETCH_FAILED", result.status, result.data);
      return normalizeOptionalRoom(result.data?.room);
    },

    async fetchActiveRoom(playerId: string) {
      const url = queryUrl(endpoint, { playerId });
      const result = await fetchConditionalJson<RoomResponse<Room>>(url, fetcher);
      if (!result.ok) throw new OnlineRoomApiError("ACTIVE_ROOM_FETCH_FAILED", result.status, result.data);
      return normalizeOptionalRoom(result.data?.room);
    },

    fetchJoinableRoomPage,

    async fetchJoinableRooms(options: OnlineRoomDiscoveryOptions = {}) {
      discoveryController?.abort(new DOMException("Superseded", "AbortError"));
      const controller = new AbortController();
      discoveryController = controller;
      const stopTracking = trackOnlineRoomDiscovery(controller);
      const abortFromCaller = () => controller.abort(options.signal?.reason);
      if (options.signal?.aborted) abortFromCaller();
      else options.signal?.addEventListener("abort", abortFromCaller, { once: true });
      try {
        const rooms = await consumeOnlineRoomDiscovery(
          endpoint,
          fetchJoinableRoomPage,
          { ...options, signal: controller.signal },
        );
        discoveredRoomGenerations.clear();
        ambiguousDiscoveredCodes.clear();
        for (const room of rooms) {
          const currentGeneration = discoveredRoomGenerations.get(room.code);
          if (currentGeneration && currentGeneration !== room.roomGenerationId) {
            discoveredRoomGenerations.delete(room.code);
            ambiguousDiscoveredCodes.add(room.code);
          } else if (!ambiguousDiscoveredCodes.has(room.code)) {
            discoveredRoomGenerations.set(room.code, room.roomGenerationId);
          }
        }
        discoveryEpoch = currentOnlineRoomDiscoveryEpoch();
        return rooms;
      } finally {
        stopTracking();
        options.signal?.removeEventListener("abort", abortFromCaller);
        if (discoveryController === controller) discoveryController = null;
      }
    },

    async post<TPayload, TResult>(payload: TPayload, errorCode = "ROOM_SAVE_FAILED") {
      const requestedAt = Date.now();
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return responseJson<TResult>(response, errorCode, requestedAt);
    },

    async patch<TAction>(
      code: string,
      action: TAction,
      options: { expectedRoomInstanceId?: string } = {},
    ) {
      const requestedAt = Date.now();
      const actionType = action && typeof action === "object"
        ? (action as { type?: unknown }).type
        : null;
      if (
        actionType === "join-room"
        && options.expectedRoomInstanceId === undefined
        && discoveryEpoch === currentOnlineRoomDiscoveryEpoch()
        && ambiguousDiscoveredCodes.has(code)
      ) {
        throw new OnlineRoomDiscoveryError("ROOM_LIST_IDENTITY_AMBIGUOUS");
      }
      const expectedRoomInstanceId = options.expectedRoomInstanceId
        ?? (
          actionType === "join-room" && discoveryEpoch === currentOnlineRoomDiscoveryEpoch()
            ? discoveredRoomGenerations.get(code)
            : undefined
        );
      const response = await fetcher(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          action,
          ...(expectedRoomInstanceId ? { expectedRoomInstanceId } : {}),
        }),
      });
      const data = await responseJson<{ room?: Room; error?: string }>(response, "ROOM_ACTION_FAILED", requestedAt);
      if (!data.room) throw new OnlineRoomApiError(data.error || "ROOM_ACTION_FAILED", response.status, data);
      return normalizeRoom(data.room);
    },

    async remove<TResult = { ok: boolean }>(values: Record<string, string>, errorCode = "ROOM_DELETE_FAILED") {
      const requestedAt = Date.now();
      const response = await fetcher(queryUrl(endpoint, values), { method: "DELETE" });
      return responseJson<TResult>(response, errorCode, requestedAt);
    },
  };
}

export async function restoreOnlineRoom<Room>(input: {
  playerId: string;
  lastCode?: string | null;
  fetchActiveRoom: (playerId: string) => Promise<Room | null>;
  fetchRoom: (code: string, playerId: string) => Promise<Room | null>;
}) {
  const activeRoom = await input.fetchActiveRoom(input.playerId);
  return activeRoom ?? (input.lastCode ? input.fetchRoom(input.lastCode, input.playerId) : null);
}
