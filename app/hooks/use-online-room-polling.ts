"use client";

import { useEffect, useRef } from "react";
import { parseOnlineRoomRevisionEvent, type OnlineRoomRealtimeGame } from "@/lib/online-room-realtime-protocol";

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
  const callbacks = useRef({ fetchRoom, onRoom, onMissing });
  useEffect(() => {
    callbacks.current = { fetchRoom, onRoom, onMissing };
  }, [fetchRoom, onMissing, onRoom]);

  useEffect(() => {
    if (!roomCode) return;
    const code = roomCode;
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let reconnectDelay = 1_000;
    let initialFailures = 0;

    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void callbacks.current.fetchRoom(code).then((latest) => {
        if (!active) return;
        if (latest) callbacks.current.onRoom(latest);
        else callbacks.current.onMissing();
      }).catch(() => undefined);
    };
    const timer = window.setInterval(refresh, intervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onStorage = storageKey ? (event: StorageEvent) => {
      if (event.key !== storageKey(code)) return;
      if (!event.newValue) callbacks.current.onMissing();
      else refresh();
    } : null;

    const connectRealtime = () => {
      if (!active || typeof WebSocket === "undefined") return;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const candidate = new WebSocket(`${protocol}://${window.location.host}/api/online-room-events`);
      socket = candidate;
      let opened = false;
      candidate.addEventListener("open", () => {
        if (!active || socket !== candidate) return candidate.close();
        opened = true;
        initialFailures = 0;
        reconnectDelay = 1_000;
        candidate.send(JSON.stringify({ type: "subscribe", game, code }));
        refresh();
      });
      candidate.addEventListener("message", (event) => {
        if (!active || typeof event.data !== "string") return;
        try {
          const update = parseOnlineRoomRevisionEvent(JSON.parse(event.data));
          if (update?.game === game && update.code === code) refresh();
        } catch {
          // Invalid realtime frames never replace the server-authoritative room state.
        }
      });
      candidate.addEventListener("error", () => candidate.close());
      candidate.addEventListener("close", () => {
        if (socket === candidate) socket = null;
        if (!active) return;
        if (!opened && ++initialFailures >= 3) return;
        reconnectTimer = window.setTimeout(connectRealtime, reconnectDelay);
        reconnectDelay = Math.min(10_000, reconnectDelay * 2);
      });
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (onStorage) window.addEventListener("storage", onStorage);
    connectRealtime();
    return () => {
      active = false;
      window.clearInterval(timer);
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (onStorage) window.removeEventListener("storage", onStorage);
    };
  }, [game, intervalMs, roomCode, storageKey]);
}
