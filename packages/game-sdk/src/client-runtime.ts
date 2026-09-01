import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkRoomListPage,
  GameSdkRoomSnapshot,
} from "./index.js";
import {
  createGameSdkRoomWatcher,
  type GameSdkRoomReadSource,
  type GameSdkRoomWatch,
  type GameSdkRoomWatchObserver,
  type GameSdkWebSocketLike,
} from "./client-realtime.js";

export type {
  GameSdkRoomReadSource,
  GameSdkRoomWatch,
  GameSdkRoomWatchObserver,
  GameSdkRoomWatchStatus,
  GameSdkWebSocketLike,
} from "./client-realtime.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const commandResponseRooms = new WeakSet<object>();
const commandResponseTimings = new WeakMap<object, GameSdkCommandTransportTiming>();

/** True only for snapshots returned directly by a successful Command PATCH. */
export function gameSdkRoomHasCommandResponseView(value: unknown) {
  return Boolean(value && typeof value === "object" && commandResponseRooms.has(value));
}

export type GameSdkCommandTransportTiming = {
  requestRef?: string;
  traceRef?: string;
  revision: number;
  entries: Array<{
    stage: string;
    durationMs: number;
    source: "server" | "browser";
  }>;
};

export function gameSdkCommandTimingForRoom(value: unknown) {
  return value && typeof value === "object"
    ? commandResponseTimings.get(value) ?? null
    : null;
}

export type GameSdkRoomReadOperation =
  | "read-room"
  | "read-debug-viewer"
  | "read-active-room"
  | "list-rooms";

export type GameSdkRoomReadTelemetryEvent = {
  operationId: string;
  operation: GameSdkRoomReadOperation;
  source: GameSdkRoomReadSource;
  durationMs: number;
  outcome: "success" | "not-found" | "failed";
  statusCode: number;
  errorCode?: string;
  revision?: number;
  roomCount?: number;
};

export type GameSdkHttpClientRuntime<
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  createRoom(input: {
    roomCode: string;
    create: TCreateInput;
    requestId?: string;
    replaceActiveRoom?: {
      code: string;
      packageRevision: string;
    };
  }): Promise<GameSdkRoomSnapshot<TRoomView>>;
  readRoom(code: string): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  readRoomAsDebugViewer(
    code: string,
    viewer: number | "spectator",
  ): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  readActiveRoom(): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  listRooms(
    cursor?: string | null,
    options?: { signal?: AbortSignal },
  ): Promise<GameSdkRoomListPage>;
  sendCommand(
    code: string,
    envelope: GameSdkCommandEnvelope<TCommand>,
    options?: {
      finalViewer?: number | "spectator" | "self";
    },
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
  observeServerDate?(
    dateHeader: string | null,
    requestedAt: number,
    receivedAt: number,
  ): void;
  onRoomReadTelemetry?(event: GameSdkRoomReadTelemetryEvent): void;
  onCommandTiming?(event: GameSdkCommandTransportTiming): void;
};

export class GameSdkHttpClientRuntimeError extends Error {
  readonly code: string;
  readonly status: number;
  readonly payload: unknown;
  readonly retryAfterMs: number | null;
  readonly serverDeadlineAt: number | null;

  constructor(code: string, status: number, payload: unknown = null) {
    super(code);
    this.name = "GameSdkHttpClientRuntimeError";
    this.code = code;
    this.status = status;
    this.payload = payload;
    const details = payload && typeof payload === "object"
      ? payload as { retryAfterMs?: unknown; serverDeadlineAt?: unknown }
      : null;
    const retryAfterMs = Number(details?.retryAfterMs);
    const serverDeadlineAt = Number(details?.serverDeadlineAt);
    this.retryAfterMs = Number.isFinite(retryAfterMs) ? retryAfterMs : null;
    this.serverDeadlineAt = Number.isFinite(serverDeadlineAt)
      ? serverDeadlineAt
      : null;
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
    && (
      room.packageRevision === undefined
      || (
        typeof room.packageRevision === "string"
        && room.packageRevision.length >= 1
        && room.packageRevision.length <= 160
      )
    )
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
      && typeof room.roomGenerationId === "string"
      && room.roomGenerationId.length > 0
      && room.roomGenerationId.length <= 128
      && typeof room.phase === "string"
      && Number.isSafeInteger(room.revision)
      && (
        room.packageRevision === undefined
        || (
          typeof room.packageRevision === "string"
          && room.packageRevision.length >= 1
          && room.packageRevision.length <= 160
        )
      )
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
  observeServerDate?: GameSdkHttpClientRuntimeOptions["observeServerDate"],
) {
  const requestedAt = Date.now();
  const response = await fetcher(input, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
  });
  observeServerDate?.(response.headers.get("date"), requestedAt, Date.now());
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

function createCommandId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `sdk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function emitRoomReadTelemetry(
  sink: GameSdkHttpClientRuntimeOptions["onRoomReadTelemetry"],
  event: GameSdkRoomReadTelemetryEvent,
) {
  try {
    sink?.(event);
  } catch {
    // Observability must never change room transport behavior.
  }
}

function commandServerTiming(value: string | null) {
  if (!value) return [];
  return value.split(",").flatMap((item) => {
    const [stage = "", ...parameters] = item.trim().split(";");
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(stage)) return [];
    const duration = parameters.find((parameter) => parameter.startsWith("dur="));
    const durationMs = Number(duration?.slice("dur=".length));
    return Number.isFinite(durationMs) && durationMs >= 0
      ? [{ stage, durationMs, source: "server" as const }]
      : [];
  });
}

/**
 * Browser transport injected by Game Fields for an approved SDK game.
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
  observeServerDate,
  onRoomReadTelemetry,
  onCommandTiming,
}: GameSdkHttpClientRuntimeOptions): GameSdkHttpClientRuntime<TCreateInput, TCommand, TRoomView> {
  const endpoint = normalizeEndpoint(endpointInput);
  const gameId = gameIdInput.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(gameId)) {
    throw new Error("Game SDK gameId is invalid.");
  }
  const requestRuntimeJson = (
    input: RequestInfo | URL,
    init: RequestInit,
    fallbackError: string,
  ) => requestJson(
    fetcher,
    input,
    init,
    fallbackError,
    observeServerDate,
  );

  const readRoomWithSource = async (
    code: string,
    source: GameSdkRoomReadSource,
  ): Promise<GameSdkRoomSnapshot<TRoomView> | null> => {
    const operationId = createCommandId();
    const startedAt = Date.now();
    try {
      const requestedAt = Date.now();
      const response = await fetcher(roomUrl(endpoint, code), {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      observeServerDate?.(response.headers.get("date"), requestedAt, Date.now());
      const payload = await readPayload(response);
      if (response.status === 404) {
        emitRoomReadTelemetry(onRoomReadTelemetry, {
          operationId,
          operation: "read-room",
          source,
          durationMs: Math.max(0, Date.now() - startedAt),
          outcome: "not-found",
          statusCode: 404,
        });
        return null;
      }
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
      emitRoomReadTelemetry(onRoomReadTelemetry, {
        operationId,
        operation: "read-room",
        source,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome: "success",
        statusCode: response.status,
        revision: room.revision,
      });
      return room;
    } catch (error) {
      emitRoomReadTelemetry(onRoomReadTelemetry, {
        operationId,
        operation: "read-room",
        source,
        durationMs: Math.max(0, Date.now() - startedAt),
        outcome: "failed",
        statusCode: error instanceof GameSdkHttpClientRuntimeError ? error.status : 0,
        errorCode: error instanceof GameSdkHttpClientRuntimeError
          ? error.code
          : "GAME_SDK_ROOM_READ_NETWORK_FAILED",
      });
      throw error;
    }
  };

  const runtime: GameSdkHttpClientRuntime<TCreateInput, TCommand, TRoomView> = {
    async createRoom(input) {
      const requestId = input.requestId?.trim() || createCommandId();
      input.requestId = requestId;
      const request = () => requestRuntimeJson(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, requestId }),
        },
        "GAME_SDK_ROOM_CREATE_FAILED",
      );
      let payload: unknown;
      try {
        payload = await request();
      } catch (error) {
        if (error instanceof GameSdkHttpClientRuntimeError) throw error;
        payload = await request();
      }
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

    readRoom(code) {
      return readRoomWithSource(code, "direct");
    },

    async readRoomAsDebugViewer(code, viewer) {
      const operationId = createCommandId();
      const startedAt = Date.now();
      try {
        const payload = await requestRuntimeJson(
          queryUrl(endpoint, {
            code,
            debugViewer: String(viewer),
          }),
          { method: "GET" },
          "GAME_SDK_DEBUG_VIEW_READ_FAILED",
        );
        const room = (payload as { room?: unknown }).room;
        if (!isRoomSnapshot<TRoomView>(room)) {
          throw new GameSdkHttpClientRuntimeError(
            "GAME_SDK_INVALID_ROOM_RESPONSE",
            502,
            payload,
          );
        }
        emitRoomReadTelemetry(onRoomReadTelemetry, {
          operationId,
          operation: "read-debug-viewer",
          source: "direct",
          durationMs: Math.max(0, Date.now() - startedAt),
          outcome: "success",
          statusCode: 200,
          revision: room.revision,
        });
        return room;
      } catch (error) {
        emitRoomReadTelemetry(onRoomReadTelemetry, {
          operationId,
          operation: "read-debug-viewer",
          source: "direct",
          durationMs: Math.max(0, Date.now() - startedAt),
          outcome: "failed",
          statusCode: error instanceof GameSdkHttpClientRuntimeError ? error.status : 0,
          errorCode: error instanceof GameSdkHttpClientRuntimeError
            ? error.code
            : "GAME_SDK_DEBUG_VIEW_NETWORK_FAILED",
        });
        throw error;
      }
    },

    async readActiveRoom() {
      const operationId = createCommandId();
      const startedAt = Date.now();
      try {
        const payload = await requestRuntimeJson(
          queryUrl(endpoint, { active: "1" }),
          { method: "GET" },
          "GAME_SDK_ACTIVE_ROOM_READ_FAILED",
        );
        const room = (payload as { room?: unknown }).room;
        if (room === null) {
          emitRoomReadTelemetry(onRoomReadTelemetry, {
            operationId,
            operation: "read-active-room",
            source: "direct",
            durationMs: Math.max(0, Date.now() - startedAt),
            outcome: "not-found",
            statusCode: 200,
          });
          return null;
        }
        if (!isRoomSnapshot<TRoomView>(room)) {
          throw new GameSdkHttpClientRuntimeError(
            "GAME_SDK_INVALID_ROOM_RESPONSE",
            502,
            payload,
          );
        }
        emitRoomReadTelemetry(onRoomReadTelemetry, {
          operationId,
          operation: "read-active-room",
          source: "direct",
          durationMs: Math.max(0, Date.now() - startedAt),
          outcome: "success",
          statusCode: 200,
          revision: room.revision,
        });
        return room;
      } catch (error) {
        emitRoomReadTelemetry(onRoomReadTelemetry, {
          operationId,
          operation: "read-active-room",
          source: "direct",
          durationMs: Math.max(0, Date.now() - startedAt),
          outcome: "failed",
          statusCode: error instanceof GameSdkHttpClientRuntimeError ? error.status : 0,
          errorCode: error instanceof GameSdkHttpClientRuntimeError
            ? error.code
            : "GAME_SDK_ACTIVE_ROOM_READ_NETWORK_FAILED",
        });
        throw error;
      }
    },

    async listRooms(cursor = null, options = {}) {
      const operationId = createCommandId();
      const startedAt = Date.now();
      try {
        const query: Record<string, string> = {};
        if (cursor) query.cursor = cursor;
        const payload = await requestRuntimeJson(
          queryUrl(endpoint, query),
          { method: "GET", signal: options.signal },
          "GAME_SDK_ROOM_LIST_FAILED",
        );
        if (!isRoomListPage(payload)) {
          throw new GameSdkHttpClientRuntimeError(
            "GAME_SDK_INVALID_ROOM_LIST_RESPONSE",
            502,
            payload,
          );
        }
        emitRoomReadTelemetry(onRoomReadTelemetry, {
          operationId,
          operation: "list-rooms",
          source: "direct",
          durationMs: Math.max(0, Date.now() - startedAt),
          outcome: "success",
          statusCode: 200,
          roomCount: payload.rooms.length,
        });
        return payload;
      } catch (error) {
        emitRoomReadTelemetry(onRoomReadTelemetry, {
          operationId,
          operation: "list-rooms",
          source: "direct",
          durationMs: Math.max(0, Date.now() - startedAt),
          outcome: "failed",
          statusCode: error instanceof GameSdkHttpClientRuntimeError ? error.status : 0,
          errorCode: error instanceof GameSdkHttpClientRuntimeError
            ? error.code
            : "GAME_SDK_ROOM_LIST_NETWORK_FAILED",
        });
        throw error;
      }
    },

    async sendCommand(code, envelope, options) {
      const commandId = envelope.commandId?.trim() || createCommandId();
      envelope.commandId = commandId;
      const request = async () => {
        const requestedAt = Date.now();
        const response = await fetcher(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            envelope: { ...envelope, commandId },
            ...(options?.finalViewer !== undefined
              ? { finalViewer: options.finalViewer }
              : {}),
          }),
          cache: "no-store",
          credentials: "same-origin",
        });
        observeServerDate?.(response.headers.get("date"), requestedAt, Date.now());
        const payload = await readPayload(response);
        if (!response.ok) {
          throw new GameSdkHttpClientRuntimeError(
            errorCode(payload, "GAME_SDK_COMMAND_FAILED"),
            response.status,
            payload,
          );
        }
        if (payload === null) {
          throw new GameSdkHttpClientRuntimeError(
            "GAME_SDK_COMMAND_FAILED",
            response.status,
            null,
          );
        }
        return { payload, response };
      };
      const httpStartedAt = performance.now();
      let transport: Awaited<ReturnType<typeof request>>;
      try {
        transport = await request();
      } catch (error) {
        if (error instanceof GameSdkHttpClientRuntimeError) throw error;
        transport = await request();
      }
      const { payload, response } = transport;
      const result = payload as Partial<GameSdkCommandResult<TRoomView>>;
      if (
        !isRoomSnapshot<TRoomView>(result.room)
        || !Number.isSafeInteger(result.revision)
        || result.revision !== result.room.revision
        || result.commandId !== commandId
        || !Number.isSafeInteger(result.commandRevision)
        || typeof result.applied !== "boolean"
      ) {
        throw new GameSdkHttpClientRuntimeError(
          "GAME_SDK_INVALID_COMMAND_RESPONSE",
          502,
          payload,
        );
      }
      commandResponseRooms.add(result.room as object);
      const requestRef = response.headers.get("x-game-sdk-request") ?? "";
      const trace = response.headers.get("x-game-sdk-trace") ?? "";
      const timing: GameSdkCommandTransportTiming = {
        ...( /^event_[A-Za-z0-9_-]{16}$/.test(requestRef)
          ? { requestRef }
          : {}),
        ...( /^command_[A-Za-z0-9_-]{8,80}$/.test(trace)
          ? { traceRef: trace }
          : {}),
        revision: result.room.revision,
        entries: [
          ...commandServerTiming(response.headers.get("server-timing")),
          {
            stage: "http-receive",
            durationMs: Math.max(0, performance.now() - httpStartedAt),
            source: "browser",
          },
        ],
      };
      commandResponseTimings.set(result.room as object, timing);
      try {
        onCommandTiming?.(timing);
      } catch {
        // Timing observation must never change Command semantics.
      }
      return result as GameSdkCommandResult<TRoomView>;
    },

    async dissolveRoom(code) {
      const payload = await requestRuntimeJson(
        roomUrl(endpoint, code),
        { method: "DELETE" },
        "GAME_SDK_ROOM_DISSOLVE_FAILED",
      );
      return (payload as { dissolved?: unknown }).dissolved === true;
    },

    async dissolveHostedRooms() {
      const payload = await requestRuntimeJson(
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
        readRoom: readRoomWithSource,
        observer,
        pollingInterval,
        reconciliationInterval,
        webSocketFactory,
      });
    },
  };

  return runtime;
}
