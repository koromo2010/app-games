import { recordWordWolfGuessFeedback } from "@/lib/wordwolf-guess-judgement";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { loadStoredWordWolfRoom } from "@/lib/wordwolf-room-store";
import { createRequestTelemetry } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function POST(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("wordwolf");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/guess-feedback", { game: "wordwolf", operation: "guess-feedback" });
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.feedback, { playerId: player.id });
    if (limited) return limited;
    const body = (await request.json()) as { roomCode?: unknown; guess?: unknown; accepted?: unknown };
    const roomCode = typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : "";
    const guess = typeof body.guess === "string" ? body.guess.trim() : "";
    const room = roomCode ? await loadStoredWordWolfRoom(roomCode) : null;
    const logFields = {
      action: typeof body.accepted === "boolean" ? (body.accepted ? "accept" : "reject") : "invalid",
      roomRef: telemetry.roomRef(roomCode),
      actorRef: telemetry.actorRef(player.id),
    };

    if (!guess || typeof body.accepted !== "boolean") {
      telemetry.reject("feedback.save", 400, logFields);
      return Response.json({ error: "roomCode, guess and accepted are required" }, { status: 400 });
    }
    if (!room) {
      telemetry.reject("feedback.save", 404, logFields);
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    if (room.phase !== "result" || !room.players.some((item) => item.id === player.id)) {
      telemetry.reject("feedback.save", 403, { ...logFields, phase: room.phase });
      return Response.json({ error: "Room action is not allowed" }, { status: 403 });
    }

    const feedback = await recordWordWolfGuessFeedback(guess, room.villageWord, body.accepted);
    telemetry.success("feedback.save", { ...logFields, phase: room.phase });
    return Response.json({ feedback });
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("feedback.save", error, 401);
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("feedback.save", error, 503);
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("feedback.save", error, 503);
      return Response.json({ error: "Guess feedback storage is not configured" }, { status: 503 });
    }

    telemetry.failure("feedback.save", error);
    return Response.json({ error: "Failed to save guess feedback" }, { status: 500 });
  }
}
