"use client";

import { useEffect, useRef } from "react";
import {
  nextOnlineRoomRealtimeReconnectDelay,
  onlineRoomRealtimeTimings,
  parseOnlineRoomRevisionEvent,
  type OnlineRoomRealtimeGame,
} from "@/lib/online-room-realtime-protocol";
import {
  publishOnlineRoomSyncDiagnostics,
  type OnlineRoomSyncDiagnostics,
  type OnlineRoomSyncMode,
} from "./online-room-sync-diagnostics";

export const onlineRoomPollingIntervals = {
  realtime: 500,
  active: 1000,
  idle: 2000,
} as const;

type OnlineRoomPollingOptions<Room> = {
  game: OnlineRoomRealtimeGame;
  roomCode?: string | null;
  intervalMs: number;
  fetchRoom: (code: string) => Promise<Room | null>;
  onRoom: (room: Room) => void;
  onMissing: () => void;
  storageKey?: (code: string) => string;
};

/** Polls only while visible, refreshes on tab return, and optionally follows local cross-tab room events. */
export function useOnlineRoomPolling<Room>({
  game,
  roomCode,
  intervalMs,
  fetchRoom,
  onRoom,
  onMissing,
  storageKey,
}: OnlineRoomPollingOptions<Room>) {
  const callbacks = useRef({ fetchRoom, onRoom, onMissing, intervalMs, storageKey });
  useEffect(() => {
    callbacks.current = { fetchRoom, onRoom, onMissing, intervalMs, storageKey };
  }, [fetchRoom, intervalMs, onMissing, onRoom, storageKey]);

  useEffect(() => {
    if (!roomCode) return;
    const code = roomCode;
    let active = true;
    let socket: WebSocket | null = null;
    let availabilityController: AbortController | null = null;
    let fallbackTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let reconciliationTimer: number | undefined;
    let subscriptionTimer: number | undefined;
    let reconnectDelay: number = onlineRoomRealtimeTimings.initialReconnect;
    let realtimeAvailable = false;
    let subscribed = false;
    let refreshInFlight = false;
    let refreshQueued = false;
    let diagnostics: OnlineRoomSyncDiagnostics = {
      mode: "reconnecting",
      roomGetCount: 0,
      notificationCount: 0,
    };

    const updateDiagnostics = (
      updates: Partial<OnlineRoomSyncDiagnostics> & { mode?: OnlineRoomSyncMode },
    ) => {
      diagnostics = { ...diagnostics, ...updates };
      publishOnlineRoomSyncDiagnostics(diagnostics);
    };

    const refresh = () => {
      if (!active) return;
      if (document.visibilityState !== "visible") return;
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      updateDiagnostics({ roomGetCount: diagnostics.roomGetCount + 1 });
      void callbacks.current.fetchRoom(code)
        .then((latest) => {
          if (!active) return;
          if (latest) callbacks.current.onRoom(latest);
          else callbacks.current.onMissing();
        })
        .catch(() => undefined)
        .finally(() => {
          refreshInFlight = false;
          if (!active || !refreshQueued) return;
          refreshQueued = false;
          refresh();
        });
    };

    const scheduleFallbackPoll = () => {
      if (!active || subscribed || fallbackTimer !== undefined) return;
      fallbackTimer = window.setTimeout(() => {
        fallbackTimer = undefined;
        if (!active || subscribed) return;
        refresh();
        scheduleFallbackPoll();
      }, callbacks.current.intervalMs);
    };

    const startFallbackPolling = (refreshImmediately = false) => {
      if (subscribed) return;
      scheduleFallbackPoll();
      if (refreshImmediately) refresh();
    };

    const stopFallbackPolling = () => {
      if (fallbackTimer === undefined) return;
      window.clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    };

    const stopReconciliation = () => {
      if (reconciliationTimer === undefined) return;
      window.clearInterval(reconciliationTimer);
      reconciliationTimer = undefined;
    };

    const startReconciliation = () => {
      stopReconciliation();
      reconciliationTimer = window.setInterval(refresh, onlineRoomRealtimeTimings.reconciliation);
    };

    const clearSubscriptionTimeout = () => {
      if (subscriptionTimer === undefined) return;
      window.clearTimeout(subscriptionTimer);
      subscriptionTimer = undefined;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const onStorage = (event: StorageEvent) => {
      const key = callbacks.current.storageKey?.(code);
      if (!key || event.key !== key) return;
      if (!event.newValue) callbacks.current.onMissing();
      else refresh();
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimer !== undefined) return;
      updateDiagnostics({ mode: "reconnecting" });
      startFallbackPolling();
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        if (realtimeAvailable) connectRealtime();
        else void checkRealtimeAvailability();
      }, reconnectDelay);
      reconnectDelay = nextOnlineRoomRealtimeReconnectDelay(reconnectDelay);
    };

    const connectRealtime = () => {
      if (!active || !realtimeAvailable || socket || typeof WebSocket === "undefined") return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const candidate = new WebSocket(`${protocol}://${window.location.host}/api/online-room-events`);
      socket = candidate;
      subscribed = false;
      updateDiagnostics({ mode: "reconnecting" });
      startFallbackPolling();
      candidate.addEventListener("open", () => {
        if (!active || socket !== candidate) return candidate.close();
        try {
          candidate.send(JSON.stringify({ type: "subscribe", game, code }));
          clearSubscriptionTimeout();
          subscriptionTimer = window.setTimeout(() => candidate.close(), onlineRoomRealtimeTimings.subscriptionTimeout);
        } catch {
          candidate.close();
        }
      });
      candidate.addEventListener("message", (event) => {
        if (!active || typeof event.data !== "string") return;
        try {
          const message = JSON.parse(event.data) as unknown;
          if (message && typeof message === "object" && (message as { type?: unknown }).type === "subscribed") {
            if (socket !== candidate) return;
            subscribed = true;
            reconnectDelay = onlineRoomRealtimeTimings.initialReconnect;
            clearSubscriptionTimeout();
            stopFallbackPolling();
            updateDiagnostics({ mode: "websocket" });
            startReconciliation();
            refresh();
            return;
          }
          const update = parseOnlineRoomRevisionEvent(message);
          if (update?.game === game && update.code === code) {
            updateDiagnostics({ notificationCount: diagnostics.notificationCount + 1 });
            refresh();
          }
        } catch {
          // Invalid realtime frames never replace the server-authoritative room state.
        }
      });
      candidate.addEventListener("error", () => candidate.close());
      candidate.addEventListener("close", () => {
        if (socket !== candidate) return;
        socket = null;
        clearSubscriptionTimeout();
        stopReconciliation();
        const wasSubscribed = subscribed;
        subscribed = false;
        if (!active) return;
        updateDiagnostics({ mode: "reconnecting" });
        startFallbackPolling(wasSubscribed);
        scheduleReconnect();
      });
    };

    const checkRealtimeAvailability = async () => {
      if (!active || typeof WebSocket === "undefined") {
        updateDiagnostics({ mode: "polling" });
        startFallbackPolling();
        return;
      }
      availabilityController?.abort();
      const controller = new AbortController();
      availabilityController = controller;
      try {
        const response = await fetch("/api/online-room-events", {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!active || controller.signal.aborted) return;
        if (response.status === 404) {
          updateDiagnostics({ mode: "polling" });
          startFallbackPolling();
          return;
        }
        if (!response.ok) throw new Error("Realtime availability check failed");
        realtimeAvailable = true;
        connectRealtime();
      } catch {
        if (!active || controller.signal.aborted) return;
        updateDiagnostics({ mode: "reconnecting" });
        startFallbackPolling(true);
        scheduleReconnect();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("storage", onStorage);
    publishOnlineRoomSyncDiagnostics(diagnostics);
    startFallbackPolling();
    void checkRealtimeAvailability();
    return () => {
      active = false;
      availabilityController?.abort();
      stopFallbackPolling();
      stopReconciliation();
      clearSubscriptionTimeout();
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [game, roomCode]);
}
