import { fetchConditionalJson } from "./conditional-json-client.ts";
import { observeServerDate } from "./server-clock.ts";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type RoomResponse<Room> = { room?: Room | null };
type RoomListResponse<RoomChoice> = { rooms?: RoomChoice[] };

export class OnlineRoomApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(code: string, status: number, payload: unknown = null) {
    super(code);
    this.name = "OnlineRoomApiError";
    this.status = status;
    this.payload = payload;
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

    async fetchJoinableRooms() {
      const result = await fetchConditionalJson<RoomListResponse<RoomChoice>>(endpoint, fetcher);
      if (!result.ok) throw new OnlineRoomApiError("ROOM_LIST_FAILED", result.status, result.data);
      return Array.isArray(result.data?.rooms) ? result.data.rooms : [];
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

    async patch<TAction>(code: string, action: TAction) {
      const requestedAt = Date.now();
      const response = await fetcher(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action }),
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
