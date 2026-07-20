"use client";

import { useSyncExternalStore } from "react";

export type OnlineRoomSyncMode = "websocket" | "polling" | "reconnecting";

export type OnlineRoomSyncDiagnostics = {
  mode: OnlineRoomSyncMode;
  roomGetCount: number;
  notificationCount: number;
};

const initialDiagnostics: OnlineRoomSyncDiagnostics = {
  mode: "polling",
  roomGetCount: 0,
  notificationCount: 0,
};

let currentDiagnostics = initialDiagnostics;
const listeners = new Set<() => void>();

export function publishOnlineRoomSyncDiagnostics(diagnostics: OnlineRoomSyncDiagnostics) {
  currentDiagnostics = diagnostics;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentDiagnostics;
}

function getServerSnapshot() {
  return initialDiagnostics;
}

export function useOnlineRoomSyncDiagnostics() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function onlineRoomSyncModeLabel(mode: OnlineRoomSyncMode) {
  if (mode === "websocket") return "WS接続中";
  if (mode === "reconnecting") return "再接続中";
  return "ポーリング中";
}
