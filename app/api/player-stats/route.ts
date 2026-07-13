import { getPlayerStats, normalizePlayerStatsGameFilter } from "@/lib/player-stats-store";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { createRequestTelemetry } from "@/lib/observability";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/player-stats", { operation: "stats-read" });
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId")?.trim();
  const gameType = normalizePlayerStatsGameFilter(url.searchParams.get("gameType"));

  if (!playerId) {
    return Response.json({ error: "playerId is required" }, { status: 400 });
  }

  try {
    const player = await requireAuthenticatedPlayer();
    if (playerId !== player.id) return Response.json({ error: "Player stats access is not allowed" }, { status: 403 });
    const stats = await getPlayerStats(player.id, gameType);
    return Response.json({ stats });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("stats.read", error, 503);
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("stats.read", error, 503);
      return Response.json({ error: "Player stats storage is not configured" }, { status: 503 });
    }

    telemetry.failure("stats.read", error);
    return Response.json({ error: "Failed to load player stats" }, { status: 500 });
  }
}
