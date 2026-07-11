import { getPlayerStats, normalizePlayerStatsGameFilter } from "@/lib/player-stats-store";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const playerId = url.searchParams.get("playerId")?.trim();
  const gameType = normalizePlayerStatsGameFilter(url.searchParams.get("gameType"));

  if (!playerId) {
    return Response.json({ error: "playerId is required" }, { status: 400 });
  }

  try {
    const stats = await getPlayerStats(playerId, gameType);
    return Response.json({ stats });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Player stats storage is not configured" }, { status: 503 });
    }

    return Response.json({ error: "Failed to load player stats" }, { status: 500 });
  }
}
