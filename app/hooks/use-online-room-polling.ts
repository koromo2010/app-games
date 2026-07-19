"use client";

import { useEffect, useRef } from "react";

export const onlineRoomPollingIntervals = {
  realtime: 500,
  active: 1000,
  idle: 2000,
} as const;

type OnlineRoomPollingOptions<Room> = {
  roomCode?: string | null;
  intervalMs: number;
  fetchRoom: (code: string) => Promise<Room | null>;
  onRoom: (room: Room) => void;
  onMissing: () => void;
  storageKey?: (code: string) => string;
};

/** Polls only while visible, refreshes on tab return, and optionally follows local cross-tab room events. */
export function useOnlineRoomPolling<Room>({
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

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (onStorage) window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (onStorage) window.removeEventListener("storage", onStorage);
    };
  }, [intervalMs, roomCode, storageKey]);
}
