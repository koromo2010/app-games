import { isPlayerAuthConfigurationError } from "./player-auth.ts";

export function commonOnlineRoomErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
  if (message === "DEBUG_ACCESS_REQUIRED") return Response.json({ error: "Debug access required" }, { status: 403 });
  if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
  if (message === "REDIS_STORE_NOT_CONFIGURED") return Response.json({ error: "Room storage is not configured" }, { status: 503 });
  return null;
}
