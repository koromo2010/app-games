import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkRoomListPage,
  GameSdkRoomSnapshot,
} from "./index.js";
import {
  createGameSdkRoomWatcher,
  type GameSdkRoomWatch,
  type GameSdkRoomWatchObserver,
  type GameSdkWebSocketLike,
} from "./client-realtime.js";

export type {
  GameSdkRoomWatch,
  GameSdkRoomWatchObserver,
  GameSdkRoomWatchStatus,
  GameSdkWebSocketLike,
} from "./client-realtime.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GameSdkHttpClientRuntime<
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  createRoom(input: {
    roomCode: string;
    create: TCreateInput;
  }): Promise<GameSdkRoomSnapshot<TRoomView>>;
  readRoom(code: string): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  readActiveRoom(): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  listRooms(cursor?: string | null): Promise<GameSdkRoomListPage>;
  sendCommand(
    code: string,
    envelope: GameSdkCommandEnvelope<TCommand>,
  ): Promise<GameSdkCommandResult<TRoomView>>;
  dissolveRoom(code: string): Promise<boolean>;
  dissolveHostedRooms(): Promise<number>;
  watchRoom(
    code: string,
    observer: GameSdkRoomWatchObserver<TRoomView>,
  ): GameSdkRoomWatch;
};

export type GameSdkHttpClientRuntimeOptions = {
  gameId: string;
  endpoint: string;
  realtimeEndpoint?: string;
  pollingInterval?: number;
  reconciliationInterval?: number;
  webSocketFactory?: (url: string) => GameSdkWebSocketLike;
  fetcher?: Fetcher;
};

export class GameSdkHttpClientRuntimeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly payload: unknown;

  constructor(code: string, status: number, payload: unknown = null) {
    super(code);
    this.name = "GameSdkHttpClientRuntimeError";
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

function normalizeEndpoint(value: string) {
  const endpoint = value.trim().replace(/\/+$/, "");
  if (!endpoint) throw new Error("Game SDK HTTP endpoint is required.");
  return endpoint;
}

function roomUrl(endpoint: string, code: string) {
  const url = new URL(endpoint, "https://game-fields.invalid");
  url.searchParams.set("code", code);
  if (/^https?:\/\//.test(endpoint)) return url.toString();
  return `${url.pathname}${url.search}`;
}

function queryUrl(endpoint: string, query: Record<string, string>) {
  const url = new URL(endpoint, "https://game-fields.invalid");
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  if (/^https?:\/\//.test(endpoint)) return url.toString();
  return `${url.pathname}${url.search}`;
}

function errorCode(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const value = (payload as { error?: unknown }).error;
  return typeof value === "string" && /^[A-Z0-9_]{1,80}$/.test(value)
    ? value
    : fallback;
}

function isRoomSnapshot<TRoomView>(value: unknown): value is GameSdkRoomSnapshot<TRoomView> {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<GameSdkRoomSnapshot<TRoomView>>;
  return (
    typeof room.code === "string"
    && Number.isSafeInteger(room.revision)
    && Number(room.revision) >= 1
    && typeof room.phase === "string"
    && "view" in room
  );
}

function isRoomListPage(value: unknown): value is GameSdkRoomListPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<GameSdkRoomListPage>;
  return (
    Array.isArray(page.rooms)
    && (page.nextCursor === null || typeof page.nextCursor === "string")
    && page.rooms.every((room) => (
      room
      && typeof room === "object"
      && typeof room.code === "string"
      && typeof room.phase === "string"
      && Number.isSafeInteger(room.revision)
      && Number.isSafeInteger(room.playerCount)
      && Number.isSafeInteger(room.maximumPlayers)
      && typeof room.updatedAt === "number"
    ))
  );
}

async function readPayload(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

async function requestJson(
  fetcher: Fetcher,
  input: RequestInfo | URL,
  init: RequestInit,
  fallbackError: string,
) {
  const response = await fetcher(input, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new GameSdkHttpClientRuntimeError(
      errorCode(payload, fallbackError),
      response.status,
      payload,
    );
  }
  if (payload === null) {
    throw new GameSdkHttpClientRuntimeError(fallbackError, response.status, null);
  }
  return payload;
}

/**
 * Browser transport injected by Game Fields for an approved SDK game.
 *
 * Actor identity is intentionally absent. The platform resolves it from its
 * signed HttpOnly session at the HTTP boundary.
 */
export function createGameSdkHttpClientRuntime<
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
>({
  gameId: gameIdInput,
  endpoint: endpointInput,
  realtimeEndpoint = "/api/online-room-events",
  pollingInterval = 4_000,
  reconciliationInterval = 45_000,
  webSocketFactory,
  fetcher = fetch,
}: GameSdkHttpClientRuntimeOptions): GameSdkHttpClientRuntime<TCreateInput, TCommand, TRoomView> {
  const endpoint = normalizeEndpoint(endpointInput);
  const gameId = gameIdInput.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(gameId)) {
    throw new Error("Game SDK gameId is invalid.");
  }

  const runtime: GameSdkHttpClientRuntime<TCreateInput, TCommand, TRoomView> = {
    async createRoom(input) {
      const payload = await requestJson(
        fetcher,
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "GAME_SDK_ROOM_CREATE_FAILED",
      );
      const room = (payload as { room?: unknown }).room;
      if (!isRoomSnapshot<TRoomView>(room)) {
        throw new GameSdkHttpClientRuntimeError(
          "GAME_SDK_INVALID_ROOM_RESPONSE",
          502,
          payload,
        );
      }
      return room;
    },

    async readRoom(code) {
      const response = await fetcher(roomUrl(endpoint, code), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      const payload = await readPayload(response);
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new GameSdkHttpClientRuntimeError(
          errorCode(payload, "GAME_SDK_ROOM_READ_FAILED"),
          response.status,
          payload,
        );
      }
      const room = payload && typeof payload === "object"
        ? (payload as { room?: unknown }).room
        : null;
      if (!isRoomSnapshot<TRoomView>(room)) {
        throw new GameSdkHttpClientRuntimeError(
          "GAME_SDK_INVALID_ROOM_RESPONSE",
          502,
          payload,
        );
      }
      return room;
    },

    async readActiveRoom() {
      const payload = await requestJson(
        fetcher,
        queryUrl(endpoint, { active: "1" }),
        { method: "GET" },
        "GAME_SDK_ACTIVE_ROOM_READ_FAILED",
      );
      const room = (payload as { room?: unknown }).room;
      if (room === null) return null;
      if (!isRoomSnapshot<TRoomView>(room)) {
        throw new GameSdkHttpClientRuntimeError(
          "GAME_SDK_INVALID_ROOM_RESPONSE",
          502,
          payload,
        );
      }
      return room;
    },

    async listRooms(cursor = null) {
      const query: Record<string, string> = {};
      if (cursor) query.cursor = cursor;
      const payload = await requestJson(
        fetcher,
        queryUrl(endpoint, query),
        { method: "GET" },
        "GAME_SDK_ROOM_LIST_FAILED",
      );
      if (!isRoomListPage(payload)) {
        throw new GameSdkHttpClientRuntimeError(
          "GAME_SDK_INVALID_ROOM_LIST_RESPONSE",
          502,
          payload,
        );
      }
      return payload;
    },

    async sendCommand(code, envelope) {
      const payload = await requestJson(
        fetcher,
        endpoint,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, envelope }),
        },
        "GAME_SDK_COMMAND_FAILED",
      );
      const result = payload as Partial<GameSdkCommandResult<TRoomView>>;
      if (
        !isRoomSnapshot<TRoomView>(result.room)
        || !Number.isSafeInteger(result.revision)
        || result.revision !== result.room.revision
      ) {
        throw new GameSdkHttpClientRuntimeError(
          "GAME_SDK_INVALID_COMMAND_RESPONSE",
          502,
          payload,
        );
      }
      return result as GameSdkCommandResult<TRoomView>;
    },

    async dissolveRoom(code) {
      const payload = await requestJson(
        fetcher,
        roomUrl(endpoint, code),
        { method: "DELETE" },
        "GAME_SDK_ROOM_DISSOLVE_FAILED",
      );
      return (payload as { dissolved?: unknown }).dissolved === true;
    },

    async dissolveHostedRooms() {
      const payload = await requestJson(
        fetcher,
        queryUrl(endpoint, { hosted: "1" }),
        { method: "DELETE" },
        "GAME_SDK_HOSTED_ROOMS_DISSOLVE_FAILED",
      );
      const count = (payload as { dissolved?: unknown }).dissolved;
      if (!Number.isSafeInteger(count) || Number(count) < 0) {
        throw new GameSdkHttpClientRuntimeError(
          "GAME_SDK_INVALID_DISSOLVE_RESPONSE",
          502,
          payload,
        );
      }
      return Number(count);
    },

    watchRoom(code, observer) {
      return createGameSdkRoomWatcher({
        gameId,
        code,
        endpoint,
        realtimeEndpoint,
        fetcher,
        readRoom: runtime.readRoom,
        observer,
        pollingInterval,
        reconciliationInterval,
        webSocketFactory,
      });
    },
  };

  return runtime;
}
