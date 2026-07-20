export const canvasRoomForegroundPollMs = 500;
export const canvasLobbyForegroundPollMs = 2000;
export const canvasBackgroundPollMs = 10000;
export const canvasLobbyActiveSyncMs = 30_000;

export function canvasPollInterval(surface: "room" | "lobby", hidden: boolean) {
  if (hidden) return canvasBackgroundPollMs;
  return surface === "room" ? canvasRoomForegroundPollMs : canvasLobbyForegroundPollMs;
}
