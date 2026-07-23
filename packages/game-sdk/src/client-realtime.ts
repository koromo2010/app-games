import type { GameSdkRoomSnapshot } from "./index.js";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type GameSdkRoomWatchStatus =
  | "connecting"
  | "connected"
  | "polling"
  | "closed";

export type GameSdkRoomWatchObserver<TRoomView> = {
  onRoom(room: GameSdkRoomSnapshot<TRoomView> | null): void;
  onError?(error: unknown): void;
  onStatus?(status: GameSdkRoomWatchStatus): void;
};

export type GameSdkRoomWatch = {
  close(): void;
};

export type GameSdkWebSocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: { data?: unknown }) => void,
  ): void;
};

type RoomWatcherOptions<TRoomView> = {
  gameId: string;
  code: string;
  endpoint: string;
  realtimeEndpoint: string;
  fetcher: Fetcher;
  readRoom: (code: string) => Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  observer: GameSdkRoomWatchObserver<TRoomView>;
  pollingInterval: number;
  reconciliationInterval: number;
  webSocketFactory?: (url: string) => GameSdkWebSocketLike;
};

function socketUrl(endpoint: string, fallbackEndpoint: string) {
  const browserBase = typeof location === "undefined" ? null : location.href;
  const fallbackBase = /^https?:\/\//.test(fallbackEndpoint)
    ? fallbackEndpoint
    : browserBase;
  if (!fallbackBase) return null;
  const url = new URL(endpoint, fallbackBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function defaultWebSocketFactory() {
  if (typeof WebSocket === "undefined") return undefined;
  return (url: string) => new WebSocket(url) as GameSdkWebSocketLike;
}

function eventRevision(value: unknown, game: string, code: string) {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  return (
    event.type === "room-updated"
    && event.game === game
    && event.code === code
    && Number.isSafeInteger(event.revision)
  )
    ? Number(event.revision)
    : null;
}

/**
 * Revision-only WebSocket watcher with authoritative HTTP reconciliation.
 * The socket payload never contains room state or actor identity.
 */
export function createGameSdkRoomWatcher<TRoomView>({
  gameId,
  code,
  endpoint,
  realtimeEndpoint,
  fetcher,
  readRoom,
  observer,
  pollingInterval,
  reconciliationInterval,
  webSocketFactory = defaultWebSocketFactory(),
}: RoomWatcherOptions<TRoomView>): GameSdkRoomWatch {
  const normalizedCode = code.normalize("NFKC").trim().toUpperCase();
  const realtimeGame = `sdk:${gameId}`;
  let closed = false;
  let socket: GameSdkWebSocketLike | null = null;
  let refreshPromise: Promise<void> | null = null;
  let lastRevision = 0;
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  let reconciliationTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1_000;
  let connecting = false;

  const setStatus = (status: GameSdkRoomWatchStatus) => {
    if (!closed || status === "closed") observer.onStatus?.(status);
  };

  const refresh = () => {
    if (closed) return Promise.resolve();
    if (refreshPromise) return refreshPromise;
    refreshPromise = readRoom(normalizedCode)
      .then((room) => {
        if (closed) return;
        lastRevision = room?.revision ?? lastRevision;
        observer.onRoom(room);
      })
      .catch((error: unknown) => {
        if (!closed) observer.onError?.(error);
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  };

  const startPolling = () => {
    if (closed || pollingTimer) return;
    setStatus("polling");
    pollingTimer = setInterval(() => void refresh(), pollingInterval);
  };

  const stopPolling = () => {
    if (!pollingTimer) return;
    clearInterval(pollingTimer);
    pollingTimer = null;
  };

  const startReconciliation = () => {
    if (closed || reconciliationTimer) return;
    reconciliationTimer = setInterval(() => void refresh(), reconciliationInterval);
  };

  const connect = async () => {
    if (closed || connecting) return;
    connecting = true;
    await refresh();
    if (closed || !webSocketFactory) {
      connecting = false;
      startPolling();
      return;
    }
    const availability = await fetcher(realtimeEndpoint, {
      method: "HEAD",
      cache: "no-store",
      credentials: "same-origin",
    }).catch(() => null);
    const url = availability?.status === 204
      ? socketUrl(realtimeEndpoint, endpoint)
      : null;
    if (closed || !url) {
      connecting = false;
      startPolling();
      return;
    }

    setStatus("connecting");
    const nextSocket = webSocketFactory(url);
    socket = nextSocket;
    connecting = false;
    nextSocket.addEventListener("open", () => {
      if (closed || socket !== nextSocket) return;
      reconnectDelay = 1_000;
      nextSocket.send(JSON.stringify({
        type: "subscribe",
        game: realtimeGame,
        code: normalizedCode,
      }));
      stopPolling();
      startReconciliation();
      setStatus("connected");
    });
    nextSocket.addEventListener("message", (event) => {
      if (closed || socket !== nextSocket || typeof event.data !== "string") return;
      try {
        const revision = eventRevision(
          JSON.parse(event.data),
          realtimeGame,
          normalizedCode,
        );
        if (revision !== null && revision > lastRevision) void refresh();
      } catch {
        // Invalid revision frames never become application state.
      }
    });
    const disconnected = () => {
      if (closed || socket !== nextSocket) return;
      socket = null;
      startPolling();
      if (reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(30_000, reconnectDelay * 2);
    };
    nextSocket.addEventListener("close", disconnected);
    nextSocket.addEventListener("error", disconnected);
  };

  void connect();

  return {
    close() {
      if (closed) return;
      closed = true;
      stopPolling();
      if (reconciliationTimer) clearInterval(reconciliationTimer);
      reconciliationTimer = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      socket?.close();
      socket = null;
      setStatus("closed");
    },
  };
}
