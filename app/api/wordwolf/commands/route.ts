import { loadStoredWordWolfRoom, saveStoredWordWolfRoom } from "@/lib/wordwolf-room-store";
import { applyWordWolfClueCommand, applyWordWolfStartCommand, applyWordWolfTimeout, applyWordWolfVoteCommand, wordWolfDeadlineAt, wordWolfTimeoutGraceMs } from "@/lib/wordwolf-command-domain";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { sanitizeWordWolfRoom } from "@/lib/wordwolf-room-store";
import { generateWordWolfTopicResponse } from "@/app/api/wordwolf/topic/route";
import { isValidWordWolfTopic, type WordWolfTopic } from "@/lib/wordwolf";
import { judgeWordWolfGuess } from "@/lib/wordwolf-guess-judgement";
import { withGameGenerationCache } from "@/lib/game-generation-cache";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { recordPlayerActivity } from "@/lib/player-timeout-policy";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";

export async function POST(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("wordwolf");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/commands", { game: "wordwolf", operation: "room-command" });
  let logFields: ObservabilityFields = {};
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const body = await request.json() as { code?: string; type?: string; commandId?: string; playerId?: string; text?: string; targetId?: string; guess?: string };
    logFields = {
      action: body.type,
      roomRef: telemetry.roomRef(body.code),
      actorRef: telemetry.actorRef(player.id),
      commandRef: telemetry.commandRef(body.commandId),
    };
    if (!body.code || !body.commandId || body.commandId.length > 160) {
      telemetry.reject("game.command", 400, logFields);
      return Response.json({ error: "Invalid command" }, { status: 400 });
    }
    const room = await loadStoredWordWolfRoom(body.code);
    if (!room) {
      telemetry.reject("game.command", 404, logFields);
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    logFields = { ...logFields, phase: room.phase, revision: room.revision, round: room.currentRound, gameNumber: room.gameNumber, debugMode: room.debugMode };
    if (!room.players.some((item) => item.id === player.id)) {
      telemetry.reject("game.command", 403, logFields);
      return Response.json({ error: "Room action is not allowed" }, { status: 403 });
    }
    const requestedActorId = body.playerId ?? "";
    const actorId = room.debugMode && room.hostId === player.id && requestedActorId
      ? requestedActorId
      : player.id;
    const deadline = wordWolfDeadlineAt(room);
    if (body.type !== "expire-phase" && deadline && Date.now() > deadline + wordWolfTimeoutGraceMs()) {
      telemetry.reject("game.command", 409, { ...logFields, retryAfterMs: 0 });
      return Response.json({ error: "Command arrived after the grace period", room: sanitizeWordWolfRoom(room, player.id) }, { status: 409 });
    }
    let next = body.type === "expire-phase"
      ? applyWordWolfTimeout(room)
      : body.type === "submit-clue" && typeof body.text === "string"
        ? applyWordWolfClueCommand(room, actorId, body.text)
        : body.type === "cast-vote" && body.targetId
          ? applyWordWolfVoteCommand(room, actorId, body.targetId)
          : null;
    if (body.type === "start-game") {
      if (room.hostId !== player.id || room.phase !== "lobby") {
        telemetry.reject("game.command", 403, logFields);
        return Response.json({ error: "Room action is not allowed" }, { status: 403 });
      }
      if (!room.debugMode && room.players.length < 3) {
        telemetry.reject("game.command", 409, { ...logFields, playerCount: room.players.length });
        return Response.json({ error: "At least 3 players are required" }, { status: 409 });
      }
      const aiLimited = await rateLimitResponseFor(request, rateLimitPolicies.aiGeneration, { playerId: player.id });
      if (aiLimited) return aiLimited;
      const topicUrl = new URL(request.url);
      topicUrl.pathname = "/api/wordwolf/topic";
      topicUrl.search = new URLSearchParams({
        roomCode: room.code,
        gameNumber: String(room.gameNumber),
        source: room.topicDictionarySource,
        distance: room.topicPairDistance,
        difficulty: room.topicDifficulty,
        ...(room.topicHint ? { hint: room.topicHint } : {}),
      }).toString();
      const generated = await withGameGenerationCache("wordwolf-topic-v3", `${room.code}:${room.gameNumber}`, async () => {
        const response = await generateWordWolfTopicResponse(new Request(topicUrl), room.players.map((item) => item.id));
        return { status: response.status, body: await response.json() as WordWolfTopic & { error?: string } };
      });
      const topic = generated.body;
      if (generated.status >= 400 || !isValidWordWolfTopic(topic)) {
        telemetry.reject("game.command", generated.status, logFields);
        return Response.json({ error: topic.error || "Topic generation failed" }, { status: generated.status });
      }
      next = applyWordWolfStartCommand(room, player.id, topic);
    }
    if (body.type === "submit-wolf-guess") {
      const guess = typeof body.guess === "string" ? body.guess.trim().slice(0, 120) : "";
      const canAct = room.phase === "wolfGuess" && room.accusedId && wolfIdsForRoom(room).includes(room.accusedId) && (player.id === room.accusedId || (room.debugMode && room.hostId === player.id));
      if (!guess || !canAct) {
        telemetry.reject("game.command", 403, logFields);
        return Response.json({ error: "Room action is not allowed" }, { status: 403 });
      }
      const aiLimited = await rateLimitResponseFor(request, rateLimitPolicies.aiGeneration, { playerId: player.id });
      if (aiLimited) return aiLimited;
      const judgement = await judgeWordWolfGuess(guess, room.villageWord);
      next = recordPlayerActivity({
        ...room,
        phase: "result" as const,
        currentTurnStartedAt: null,
        wolfGuess: guess,
        wolfGuessJudgement: judgement,
        winner: judgement.accepted ? "wolf" as const : "village" as const,
        resultText: judgement.accepted
          ? "逆転回答を正解扱いにしました。狼の勝利です。"
          : "逆転回答は不正解扱いです。村側の勝利です。",
      }, room.accusedId!);
    }
    if (!next) {
      if (body.type !== "expire-phase") {
        telemetry.reject("game.command", 409, logFields);
        return Response.json({ error: "Command is not valid for the current room state", room: sanitizeWordWolfRoom(room, player.id) }, { status: 409 });
      }
      const retryAfterMs = deadline ? Math.max(0, deadline + wordWolfTimeoutGraceMs() - Date.now()) : 0;
      telemetry.info("game.command", { ...logFields, outcome: "ignored", applied: false, retryAfterMs });
      return Response.json({ room: sanitizeWordWolfRoom(room, player.id), applied: false, retryAfterMs });
    }
    try {
      const saved = await saveStoredWordWolfRoom({ ...next, revision: room.revision + 1, updatedAt: Date.now() });
      telemetry.success("game.command", { ...logFields, applied: true, revision: saved.revision, phase: saved.phase });
      return Response.json({ room: sanitizeWordWolfRoom(saved, player.id), applied: true });
    } catch (error) {
      if (error instanceof Error && error.message === "WORDWOLF_ROOM_CONFLICT") {
        const latest = await loadStoredWordWolfRoom(body.code);
        telemetry.reject("game.command", 409, { ...logFields, applied: false, revision: latest?.revision });
        return Response.json({ room: latest ? sanitizeWordWolfRoom(latest, player.id) : null, applied: false });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("game.command", error, 401, logFields);
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("game.command", error, 503, logFields);
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    }
    if (error instanceof Error && error.message === "GAME_GENERATION_IN_PROGRESS") {
      telemetry.responseError("game.command", error, 409, logFields);
      return Response.json({ error: "Topic generation is still in progress" }, { status: 409 });
    }
    telemetry.failure("game.command", error, 500, logFields);
    return Response.json({ error: "Failed to apply command" }, { status: 500 });
  }
}

function wolfIdsForRoom(room: { wolfIds: string[]; wolfId: string | null }) {
  return room.wolfIds.length ? room.wolfIds : room.wolfId ? [room.wolfId] : [];
}
