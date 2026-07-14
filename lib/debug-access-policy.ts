export function roomRequestsDebugMode(room: unknown) {
  return Boolean(room && typeof room === "object" && "debugMode" in room && (room as { debugMode?: unknown }).debugMode === true);
}

export function actionRequiresDebugAccess(action: unknown) {
  if (!action || typeof action !== "object") return false;
  const candidate = action as { type?: unknown; enabled?: unknown; actorId?: unknown; playerId?: unknown };
  if (typeof candidate.type !== "string") return false;
  return candidate.type === "abort-game"
    || candidate.type.startsWith("debug-")
    || candidate.type === "set-debug-replay"
    || (typeof candidate.actorId === "string" && typeof candidate.playerId === "string" && candidate.actorId !== candidate.playerId)
    || (candidate.type === "set-debug" && candidate.enabled === true);
}
