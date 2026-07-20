"use client";

import { useEffect, useRef } from "react";

export const onlineRoomPollingIntervals = {
  realtime: 1000,
  active: 2000,
  idle: 5000,
} as const;

const maximumOnlineRoomPollingDelayMs = 30_000;

export function onlineRoomPollingDelay(intervalMs: number, consecutiveFailures: number) {
  const multiplier = 2 ** Math.min(Math.max(0, consecutiveFailures), 5);
  return Math.min(maximumOnlineRoomPollingDelayMs, Math.max(intervalMs, intervalMs * multiplier));
}

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
    let consecutiveFailures = 0;
    let inFlight = false;
    let timer: number | undefined;

    const schedule = (delayMs: number) => {
      if (!active) return;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, delayMs);
    };

    const refresh = () => {
      timer = undefined;
      if (!active || inFlight) return;
      if (document.visibilityState !== "visible") {
        schedule(intervalMs);
        return;
      }
      inFlight = true;
      void callbacks.current.fetchRoom(code).then((latest) => {
        if (!active) return;
        consecutiveFailures = 0;
        if (latest) callbacks.current.onRoom(latest);
        else callbacks.current.onMissing();
      }).catch(() => {
        consecutiveFailures += 1;
      }).finally(() => {
        inFlight = false;
        schedule(onlineRoomPollingDelay(intervalMs, consecutiveFailures));
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      consecutiveFailures = 0;
      if (!inFlight) {
        if (timer !== undefined) window.clearTimeout(timer);
        refresh();
      }
    };
    const onStorage = storageKey ? (event: StorageEvent) => {
      if (event.key !== storageKey(code)) return;
      if (!event.newValue) callbacks.current.onMissing();
      else if (!inFlight) {
        if (timer !== undefined) window.clearTimeout(timer);
        refresh();
      }
    } : null;

    schedule(intervalMs);
    document.addEventListener("visibilitychange", onVisibilityChange);
    if (onStorage) window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (onStorage) window.removeEventListener("storage", onStorage);
    };
  }, [intervalMs, roomCode, storageKey]);
}
