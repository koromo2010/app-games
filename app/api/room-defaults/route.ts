import {
  loadStoredRoomDefaults,
  saveStoredRoomDefaults,
} from "@/lib/room-defaults-store";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { createRequestTelemetry } from "@/lib/observability";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/room-defaults", { operation: "room-defaults-read" });
  const url = new URL(request.url);

  try {
    const player = await requireAuthenticatedPlayer();
    const requestedPlayerId = url.searchParams.get("playerId");
    if (requestedPlayerId && requestedPlayerId !== player.id) return Response.json({ error: "Room defaults access is not allowed" }, { status: 403 });
    const defaults = await loadStoredRoomDefaults(
      url.searchParams.get("game"),
      player.id,
    );
    return Response.json({ defaults });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("settings.read", error, 503);
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("settings.read", error, 503);
      return Response.json({ error: "Room defaults storage is not configured" }, { status: 503 });
    }

    telemetry.failure("settings.read", error);
    return Response.json({ error: "Failed to load room defaults" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/room-defaults", { operation: "room-defaults-save" });
  try {
    const player = await requireAuthenticatedPlayer();
    const body = (await request.json()) as {
      game?: unknown;
      playerId?: unknown;
      defaults?: unknown;
    };
    const logFields = {
      action: "save",
      game: typeof body.game === "string" ? body.game : undefined,
      actorRef: telemetry.actorRef(player.id),
    };
    if (typeof body.playerId === "string" && body.playerId !== player.id) {
      telemetry.reject("settings.save", 403, logFields);
      return Response.json({ error: "Room defaults access is not allowed" }, { status: 403 });
    }
    const defaults = await saveStoredRoomDefaults(body.game, player.id, body.defaults);
    telemetry.success("settings.save", logFields);
    return Response.json({ defaults });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("settings.save", error, 401);
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("settings.save", error, 503);
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("settings.save", error, 503);
      return Response.json({ error: "Room defaults storage is not configured" }, { status: 503 });
    }

    if (error instanceof Error && error.message === "INVALID_ROOM_DEFAULTS") {
      telemetry.responseError("settings.save", error, 400);
      return Response.json({ error: "Invalid room defaults" }, { status: 400 });
    }

    telemetry.failure("settings.save", error);
    return Response.json({ error: "Failed to save room defaults" }, { status: 500 });
  }
}
