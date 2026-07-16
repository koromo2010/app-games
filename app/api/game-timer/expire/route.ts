import { getGameTimerRetryAfterMs } from "@/lib/game-timer/policy";
import { createGameTimerEventId } from "@/lib/game-timer/event";
import { applyWordWolfTimeout, wordWolfTimerPolicy } from "@/lib/wordwolf-command-domain";
import { loadStoredWordWolfRoom, saveStoredWordWolfRoom } from "@/lib/wordwolf-room-store";
import { sanitizeWordWolfRoom } from "@/lib/wordwolf-room-store";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { loadRuntimeHyperparameterOverrides } from "@/lib/runtime-hyperparameters-store";

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/game-timer/expire", { operation: "timer-expire" });
  let logFields: ObservabilityFields = {};
  try {
    await loadRuntimeHyperparameterOverrides();
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const body = await request.json() as { game?: string; roomCode?: string; eventId?: string };
    logFields = {
      game: body.game,
      roomRef: telemetry.roomRef(body.roomCode),
      actorRef: telemetry.actorRef(player.id),
      eventRef: telemetry.eventRef(body.eventId),
    };
    if (body.game !== "wordwolf" || !body.roomCode || !body.eventId) {
      telemetry.reject("timer.expire", 400, logFields);
      return Response.json({ error: "Unsupported timer event" }, { status: 400 });
    }
    const room = await loadStoredWordWolfRoom(body.roomCode);
    if (!room) {
      telemetry.reject("timer.expire", 404, logFields);
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    logFields = { ...logFields, phase: room.phase, revision: room.revision, round: room.currentRound };
    if (!room.players.some((item) => item.id === player.id)) {
      telemetry.reject("timer.expire", 403, logFields);
      return Response.json({ error: "Room action is not allowed" }, { status: 403 });
    }
    const expectedEventId = createGameTimerEventId({ game: "wordwolf", roomCode: room.code, phase: room.phase, revision: room.revision, startedAt: room.currentTurnStartedAt });
    if (body.eventId !== expectedEventId) {
      telemetry.info("timer.expire", { ...logFields, outcome: "ignored", applied: false });
      return Response.json({ room: sanitizeWordWolfRoom(room, player.id), applied: false, retryAfterMs: 0 });
    }
    const next = applyWordWolfTimeout(room);
    if (!next) {
      const retryAfterMs = getGameTimerRetryAfterMs(wordWolfTimerPolicy(room));
      telemetry.info("timer.expire", { ...logFields, outcome: "ignored", applied: false, retryAfterMs });
      return Response.json({ room: sanitizeWordWolfRoom(room, player.id), applied: false, retryAfterMs });
    }
    try {
      const saved = await saveStoredWordWolfRoom({ ...next, revision: room.revision + 1, updatedAt: Date.now() });
      telemetry.success("timer.expire", { ...logFields, applied: true, revision: saved.revision, phase: saved.phase });
      return Response.json({ room: sanitizeWordWolfRoom(saved, player.id), applied: true, retryAfterMs: 0 });
    } catch (error) {
      if (error instanceof Error && error.message === "WORDWOLF_ROOM_CONFLICT") {
        const latest = await loadStoredWordWolfRoom(body.roomCode);
        telemetry.reject("timer.expire", 409, { ...logFields, applied: false, revision: latest?.revision });
        return Response.json({ room: latest ? sanitizeWordWolfRoom(latest, player.id) : null, applied: false, retryAfterMs: 0 });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("timer.expire", error, 401, logFields);
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("timer.expire", error, 503, logFields);
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    }
    telemetry.failure("timer.expire", error, 500, logFields);
    return Response.json({ error: "Failed to apply timer event" }, { status: 500 });
  }
}
