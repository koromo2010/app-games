import {
  getPlayerGameReplay,
  listPlayerGameReplays,
  setPlayerGameReplayFavorite,
} from "@/lib/game-replay-store";
import type { GameReplayGameType } from "@/lib/game-replay-types";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

function normalizeReplayGameType(value: string | null): GameReplayGameType | "all" {
  if (value === "wordwolf" || value === "tahoiya" || value === "northern-branch" || value === "hodoai" || value === "kotoba-senpuku") return value;
  return "all";
}

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

function replayErrorResponse(error: unknown) {
  if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
  if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
  if (isStoreNotConfigured(error)) return Response.json({ error: "Replay storage is not configured" }, { status: 503 });
  if (error instanceof Error && error.message === "GAME_REPLAY_NOT_FOUND") return Response.json({ error: "Replay not found" }, { status: 404 });
  if (error instanceof Error && error.message === "GAME_REPLAY_FAVORITE_LIMIT") return Response.json({ error: "Favorite limit reached" }, { status: 409 });
  return Response.json({ error: "Replay operation failed" }, { status: 500 });
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/player-replays", { operation: "replay-read" });
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  const gameType = normalizeReplayGameType(url.searchParams.get("gameType"));

  try {
    const player = await requireAuthenticatedPlayer();
    if (id) {
      const replay = await getPlayerGameReplay(player.id, id);
      if (!replay) return Response.json({ error: "Replay not found" }, { status: 404 });
      return Response.json({ replay });
    }
    return Response.json(await listPlayerGameReplays(player.id, gameType));
  } catch (error) {
    const response = replayErrorResponse(error);
    if (response.status >= 500) telemetry.responseError("replay.read", error, response.status);
    return response;
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/player-replays", { operation: "replay-favorite" });
  let body: { id?: unknown; favorite?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    telemetry.reject("replay.favorite", 400, { errorCode: "INVALID_JSON" });
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id || typeof body.favorite !== "boolean") {
    telemetry.reject("replay.favorite", 400, { errorCode: "INVALID_REPLAY_FAVORITE" });
    return Response.json({ error: "id and favorite are required" }, { status: 400 });
  }

  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.profileMutation, { playerId: player.id });
    if (limited) return limited;
    const replay = await setPlayerGameReplayFavorite(player.id, id, body.favorite);
    telemetry.success("replay.favorite", {
      action: body.favorite ? "add" : "remove",
      actorRef: telemetry.actorRef(player.id),
      eventRef: telemetry.eventRef(id),
    });
    return Response.json({ replay });
  } catch (error) {
    const response = replayErrorResponse(error);
    telemetry.responseError("replay.favorite", error, response.status, {
      action: body.favorite ? "add" : "remove",
      eventRef: telemetry.eventRef(id),
    });
    return response;
  }
}
