import { generateWordWolfTopicResponse } from "@/app/api/wordwolf/topic/route";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { withGameGenerationCache } from "@/lib/game-generation-cache";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { reapplyOnlineRoomMutationWithRetry } from "@/lib/online-room-persistence";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { recordPlayerActivity } from "@/lib/player-timeout-policy";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { isValidWordWolfTopic, type WordWolfTopic } from "@/lib/wordwolf";
import {
  isWordWolfCommandScope,
  type WordWolfCommandScope,
  type WordWolfCommandType,
  wordWolfCommandAlreadyApplied,
  wordWolfCommandScopeMatches,
} from "@/lib/wordwolf-command-scope";
import {
  applyWordWolfClueCommand,
  applyWordWolfStartCommand,
  applyWordWolfVoteCommand,
  wordWolfDeadlineAt,
  wordWolfTimeoutGraceMs,
} from "@/lib/wordwolf-command-domain";
import type { Room } from "@/lib/wordwolf-game-types";
import { judgeWordWolfGuess, type WordWolfGuessJudgement } from "@/lib/wordwolf-guess-judgement";
import {
  loadStoredWordWolfRoom,
  sanitizeWordWolfRoom,
  saveStoredWordWolfRoom,
} from "@/lib/wordwolf-room-store";

type WordWolfCommandBody = {
  code?: string;
  type?: string;
  commandId?: string;
  playerId?: string;
  text?: string;
  targetId?: string;
  guess?: string;
  scope?: unknown;
};

const supportedCommands = new Set<WordWolfCommandType>([
  "start-game",
  "submit-clue",
  "cast-vote",
  "submit-wolf-guess",
]);

function isSupportedCommand(value: unknown): value is WordWolfCommandType {
  return typeof value === "string" && supportedCommands.has(value as WordWolfCommandType);
}

function commandActorId(room: Room, authenticatedPlayerId: string, requestedActorId = "") {
  const requestedActorIsRoomPlayer = room.players.some((item) => item.id === requestedActorId);
  return room.debugMode && room.hostId === authenticatedPlayerId && requestedActorIsRoomPlayer
    ? requestedActorId
    : authenticatedPlayerId;
}

function assertRoomMembership(room: Room, authenticatedPlayerId: string) {
  if (!room.players.some((item) => item.id === authenticatedPlayerId)) {
    throw new Error("WORDWOLF_COMMAND_FORBIDDEN");
  }
}

function assertCommandWindow(
  room: Room,
  scope: WordWolfCommandScope,
  type: WordWolfCommandType,
) {
  if (!wordWolfCommandScopeMatches(room, scope, type)) {
    throw new Error("WORDWOLF_COMMAND_STALE");
  }
  const deadline = wordWolfDeadlineAt(room);
  if (deadline && Date.now() > deadline + wordWolfTimeoutGraceMs()) {
    throw new Error("WORDWOLF_COMMAND_AFTER_DEADLINE");
  }
}

function applyGuessResult(
  room: Room,
  guess: string,
  judgement: WordWolfGuessJudgement,
) {
  return recordPlayerActivity({
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

function wolfIdsForRoom(room: { wolfIds: string[]; wolfId: string | null }) {
  return room.wolfIds.length ? room.wolfIds : room.wolfId ? [room.wolfId] : [];
}

export async function POST(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("wordwolf");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/commands", { game: "wordwolf", operation: "room-command" });
  let logFields: ObservabilityFields = {};
  let responseRoom: Room | null = null;

  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const body = await request.json() as WordWolfCommandBody;
    logFields = {
      action: body.type,
      roomRef: telemetry.roomRef(body.code),
      actorRef: telemetry.actorRef(player.id),
      commandRef: telemetry.commandRef(body.commandId),
    };
    if (
      !body.code
      || !body.commandId
      || body.commandId.length > 160
      || !isSupportedCommand(body.type)
      || !isWordWolfCommandScope(body.scope)
    ) {
      telemetry.reject("game.command", 400, logFields);
      return Response.json({ error: "Invalid command" }, { status: 400 });
    }

    const commandType = body.type;
    const scope = body.scope;
    const initialRoom = await loadStoredWordWolfRoom(body.code);
    if (!initialRoom) {
      telemetry.reject("game.command", 404, logFields);
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    responseRoom = initialRoom;
    assertRoomMembership(initialRoom, player.id);
    const initialActorId = commandActorId(initialRoom, player.id, body.playerId);
    logFields = {
      ...logFields,
      phase: initialRoom.phase,
      revision: initialRoom.revision,
      round: initialRoom.currentRound,
      gameNumber: initialRoom.gameNumber,
      debugMode: initialRoom.debugMode,
    };

    if (wordWolfCommandAlreadyApplied(initialRoom, scope, commandType, initialActorId)) {
      telemetry.info("game.command", { ...logFields, outcome: "ignored", applied: false });
      return Response.json({ room: sanitizeWordWolfRoom(initialRoom, player.id), applied: false });
    }
    assertCommandWindow(initialRoom, scope, commandType);

    let topic: WordWolfTopic | null = null;
    if (commandType === "start-game") {
      if (initialRoom.hostId !== player.id) throw new Error("WORDWOLF_COMMAND_FORBIDDEN");
      if (!initialRoom.debugMode && initialRoom.players.length < 3) {
        telemetry.reject("game.command", 409, { ...logFields, playerCount: initialRoom.players.length });
        return Response.json({ error: "At least 3 players are required" }, { status: 409 });
      }
      const aiLimited = await rateLimitResponseFor(request, rateLimitPolicies.aiGeneration, { playerId: player.id });
      if (aiLimited) return aiLimited;
      const topicUrl = new URL(request.url);
      topicUrl.pathname = "/api/wordwolf/topic";
      topicUrl.search = new URLSearchParams({
        roomCode: initialRoom.code,
        gameNumber: String(initialRoom.gameNumber),
        source: initialRoom.topicDictionarySource,
        distance: initialRoom.topicPairDistance,
        difficulty: initialRoom.topicDifficulty,
        ...(initialRoom.topicHint ? { hint: initialRoom.topicHint } : {}),
      }).toString();
      const generated = await withGameGenerationCache(
        "wordwolf-topic-v4",
        `${initialRoom.code}:${initialRoom.gameNumber}:${initialRoom.revision}`,
        async () => {
          const response = await generateWordWolfTopicResponse(new Request(topicUrl), initialRoom.players.map((item) => item.id));
          return { status: response.status, body: await response.json() as WordWolfTopic & { error?: string } };
        },
      );
      if (generated.status >= 400 || !isValidWordWolfTopic(generated.body)) {
        telemetry.reject("game.command", generated.status, logFields);
        return Response.json({ error: generated.body.error || "Topic generation failed" }, { status: generated.status });
      }
      topic = generated.body;
    }

    let guess = "";
    let guessJudgement: WordWolfGuessJudgement | null = null;
    if (commandType === "submit-wolf-guess") {
      guess = typeof body.guess === "string" ? body.guess.trim().slice(0, 120) : "";
      const canAct = initialRoom.phase === "wolfGuess"
        && initialRoom.accusedId
        && wolfIdsForRoom(initialRoom).includes(initialRoom.accusedId)
        && (player.id === initialRoom.accusedId || (initialRoom.debugMode && initialRoom.hostId === player.id));
      if (!guess || !canAct) throw new Error("WORDWOLF_COMMAND_FORBIDDEN");
      const aiLimited = await rateLimitResponseFor(request, rateLimitPolicies.aiGeneration, { playerId: player.id });
      if (aiLimited) return aiLimited;
      guessJudgement = await withGameGenerationCache(
        "wordwolf-guess-v2",
        `${initialRoom.code}:${initialRoom.gameNumber}:${scope.phaseStartedAt ?? 0}:${guess}`,
        () => judgeWordWolfGuess(guess, initialRoom.villageWord),
      );
    }

    const result = await reapplyOnlineRoomMutationWithRetry({
      code: initialRoom.code,
      loadRoom: loadStoredWordWolfRoom,
      saveRoom: saveStoredWordWolfRoom,
      errors: { notFound: "WORDWOLF_ROOM_NOT_FOUND", conflict: "WORDWOLF_ROOM_CONFLICT" },
      mutate: (current) => {
        responseRoom = current;
        assertRoomMembership(current, player.id);
        const actorId = commandActorId(current, player.id, body.playerId);
        if (wordWolfCommandAlreadyApplied(current, scope, commandType, actorId)) return current;
        assertCommandWindow(current, scope, commandType);

        if (commandType === "start-game") {
          if (!topic || current.hostId !== player.id) throw new Error("WORDWOLF_COMMAND_FORBIDDEN");
          const next = applyWordWolfStartCommand(current, player.id, topic);
          if (!next) throw new Error("WORDWOLF_COMMAND_INVALID");
          return next;
        }
        if (commandType === "submit-clue") {
          const next = typeof body.text === "string"
            ? applyWordWolfClueCommand(current, actorId, body.text)
            : null;
          if (!next) throw new Error("WORDWOLF_COMMAND_INVALID");
          return next;
        }
        if (commandType === "cast-vote") {
          const next = typeof body.targetId === "string"
            ? applyWordWolfVoteCommand(current, actorId, body.targetId)
            : null;
          if (!next) throw new Error("WORDWOLF_COMMAND_INVALID");
          return next;
        }

        const canAct = current.phase === "wolfGuess"
          && current.accusedId
          && wolfIdsForRoom(current).includes(current.accusedId)
          && (player.id === current.accusedId || (current.debugMode && current.hostId === player.id));
        if (!guess || !guessJudgement || !canAct) throw new Error("WORDWOLF_COMMAND_FORBIDDEN");
        return applyGuessResult(current, guess, guessJudgement);
      },
    });

    responseRoom = result.room;
    if (result.applied) {
      telemetry.success("game.command", {
        ...logFields,
        applied: true,
        revision: result.room.revision,
        phase: result.room.phase,
      });
    } else {
      telemetry.info("game.command", {
        ...logFields,
        outcome: "ignored",
        applied: false,
        revision: result.room.revision,
        phase: result.room.phase,
      });
    }
    return Response.json({ room: sanitizeWordWolfRoom(result.room, player.id), applied: result.applied });
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
    if (error instanceof Error && error.message === "WORDWOLF_ROOM_NOT_FOUND") {
      telemetry.responseError("game.command", error, 404, logFields);
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "WORDWOLF_COMMAND_FORBIDDEN") {
      telemetry.responseError("game.command", error, 403, logFields);
      return Response.json({ error: "Room action is not allowed" }, { status: 403 });
    }
    if (error instanceof Error && [
      "WORDWOLF_COMMAND_STALE",
      "WORDWOLF_COMMAND_AFTER_DEADLINE",
      "WORDWOLF_COMMAND_INVALID",
      "WORDWOLF_ROOM_CONFLICT",
    ].includes(error.message)) {
      telemetry.reject("game.command", 409, { ...logFields, revision: responseRoom?.revision });
      return Response.json({
        error: error.message === "WORDWOLF_COMMAND_AFTER_DEADLINE"
          ? "Command arrived after the grace period"
          : "Command is not valid for the current room state",
        room: responseRoom ? sanitizeWordWolfRoom(responseRoom, "") : null,
      }, { status: 409 });
    }
    telemetry.failure("game.command", error, 500, logFields);
    return Response.json({ error: "Failed to apply command" }, { status: 500 });
  }
}
