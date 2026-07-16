export const canvasRoomForegroundPollMs = 250;
export const canvasLobbyForegroundPollMs = 1000;
export const canvasBackgroundPollMs = 3000;
export const canvasLobbyActiveSyncMs = 30_000;

export function canvasPollInterval(surface: "room" | "lobby", hidden: boolean) {
  if (hidden) return canvasBackgroundPollMs;
  return surface === "room" ? canvasRoomForegroundPollMs : canvasLobbyForegroundPollMs;
}
