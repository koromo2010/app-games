import { isPlayerAuthConfigurationError } from "./player-auth.ts";
import { isRedisStoreUnavailableError } from "./redis-store.ts";
import type { OnlineRoomRouteOperation } from "./online-room-route-factory.ts";

export type OnlineRoomErrorDefinition = {
  error: string;
  status: number;
  errorCode?: string;
};

type OnlineRoomErrorResponderConfig = {
  errors?: Record<string, OnlineRoomErrorDefinition>;
  dynamic?: (
    message: string,
    error: unknown,
    operation: OnlineRoomRouteOperation,
  ) => OnlineRoomErrorDefinition | null;
  fallback?: Partial<Record<OnlineRoomRouteOperation, string>>;
};

export function commonOnlineRoomErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
  if (message === "DEBUG_ACCESS_REQUIRED") return Response.json({ error: "Debug access required" }, { status: 403 });
  if (message === "ROOM_LANGUAGE_MISMATCH") return Response.json({ error: "ROOM_LANGUAGE_MISMATCH" }, { status: 403 });
  if (message === "GAME_LANGUAGE_UNAVAILABLE") return Response.json({ error: "GAME_LANGUAGE_UNAVAILABLE" }, { status: 409 });
  if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
  if (message === "REDIS_STORE_NOT_CONFIGURED") return Response.json({ error: "Room storage is not configured" }, { status: 503 });
  if (isRedisStoreUnavailableError(error)) return Response.json({
    error: "Room storage is temporarily unavailable",
    errorCode: message === "REDIS_STORE_REQUEST_LIMIT_EXCEEDED" ? "ROOM_STORE_LIMIT_EXCEEDED" : "ROOM_STORE_UNAVAILABLE",
  }, { status: 503 });
  return null;
}

export function createOnlineRoomErrorResponder(config: OnlineRoomErrorResponderConfig) {
  return (error: unknown, operation: OnlineRoomRouteOperation) => {
    const common = commonOnlineRoomErrorResponse(error);
    if (common) return common;
    const message = error instanceof Error ? error.message : "";
    const definition = config.errors?.[message] ?? config.dynamic?.(message, error, operation);
    if (definition) {
      return Response.json(
        {
          error: definition.error,
          ...(definition.errorCode ? { errorCode: definition.errorCode } : {}),
        },
        { status: definition.status },
      );
    }
    const fallback = config.fallback?.[operation]
      ?? (operation === "read"
        ? "Failed to load rooms"
        : operation === "create"
          ? "Failed to save room"
          : operation === "delete"
            ? "Failed to delete room"
            : "Failed to update room");
    return Response.json({ error: fallback }, { status: 500 });
  };
}
