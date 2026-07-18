import {
  applyStoredTahoiyaRoomAction,
  beginStoredTahoiyaTopicGeneration,
  clearStoredTahoiyaTopicGeneration,
  deleteStoredHostedTahoiyaRooms,
  deleteStoredTahoiyaRoom,
  listStoredJoinableTahoiyaRooms,
  loadAndReconcileStoredTahoiyaRoom,
  loadStoredTahoiyaRoom,
  loadStoredTahoiyaPlayerActiveRoom,
  joinStoredTahoiyaRoom,
  sanitizeTahoiyaRoom,
  createStoredTahoiyaRoom,
  startStoredTahoiyaRound,
  updateStoredTahoiyaTopicGeneration,
} from "@/lib/tahoiya-room-store";
import type { TahoiyaRoomAction } from "@/lib/tahoiya-types";
import type { TahoiyaTopic } from "@/lib/tahoiya-types";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { authenticatedRoomDraft } from "@/lib/online-room-input";
import { generateTahoiyaTopicResponse } from "@/app/api/tahoiya/topic/route";
import { withGameGenerationCache } from "@/lib/game-generation-cache";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { actionRequiresDebugAccess, requirePlayerDebugAccess, roomRequestsDebugMode } from "@/lib/debug-access";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { conditionalJsonResponse } from "@/lib/conditional-json";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

function authErrorResponse(error: unknown) {
  return commonOnlineRoomErrorResponse(error);
}

export async function GET(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("tahoiya");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/tahoiya/rooms", { game: "tahoiya", operation: "room-read" });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const playerId = url.searchParams.get("playerId");

  try {
    const player = await requireAuthenticatedPlayer();
    if (playerId && playerId !== player.id) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
    if (code) {
      const room = await loadAndReconcileStoredTahoiyaRoom(code);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      if (!room.players.some((item) => item.id === player.id)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return conditionalJsonResponse(request, { room: sanitizeTahoiyaRoom(room, player.id) });
    }

    if (playerId) {
      const room = await loadStoredTahoiyaPlayerActiveRoom(player.id);
      return conditionalJsonResponse(request, { room: room ? sanitizeTahoiyaRoom(room, player.id) : null });
    }

    const page = await listStoredJoinableTahoiyaRooms(url.searchParams.get("cursor"));
    return conditionalJsonResponse(request, page);
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      if (authError.status >= 500) telemetry.responseError("room.read", error, authError.status, { roomRef: telemetry.roomRef(code) });
      return authError;
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("room.read", error, 503, { roomRef: telemetry.roomRef(code) });
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }

    telemetry.failure("room.read", error, 500, { roomRef: telemetry.roomRef(code) });
    return Response.json({ error: "Failed to load rooms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("tahoiya");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/tahoiya/rooms", { game: "tahoiya", operation: "room-create" });
  let logFields: ObservabilityFields = { action: "create-room" };
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const body = (await request.json()) as { room?: unknown; actorId?: unknown };
    const requestedRoom = body.room && typeof body.room === "object" ? body.room as { code?: unknown } : null;
    if (roomRequestsDebugMode(requestedRoom)) await requirePlayerDebugAccess(player.id);
    logFields = { ...logFields, roomRef: telemetry.roomRef(requestedRoom?.code), actorRef: telemetry.actorRef(player.id) };
    const room = await createStoredTahoiyaRoom(authenticatedRoomDraft(body.room, player), player.id);
    telemetry.success("room.mutation", { ...logFields, phase: room.phase, revision: room.revision, playerCount: room.players.length });
    return Response.json({ room: sanitizeTahoiyaRoom(room, player.id) });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      telemetry.responseError("room.mutation", error, authError.status, logFields);
      return authError;
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("room.mutation", error, 503, logFields);
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }

    if (error instanceof Error && error.message === "INVALID_TAHOIYA_ROOM") {
      telemetry.responseError("room.mutation", error, 400, logFields);
      return Response.json({ error: "Invalid room" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_FORBIDDEN") {
      telemetry.responseError("room.mutation", error, 403, logFields);
      return Response.json({ error: "Room update is not allowed" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_PLAYER_ALREADY_ACTIVE") {
      telemetry.responseError("room.mutation", error, 409, logFields);
      return Response.json({ error: "Finish or leave the current room before entering another room" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_CONFLICT") {
      telemetry.responseError("room.mutation", error, 409, logFields);
      return Response.json({ error: "Room already exists" }, { status: 409 });
    }
    telemetry.failure("room.mutation", error, 500, logFields);
    return Response.json({ error: "Failed to save room" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("tahoiya");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/tahoiya/rooms", { game: "tahoiya", operation: "room-command" });
  let logFields: ObservabilityFields = {};
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const body = (await request.json()) as { code?: unknown; action?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code || !body.action || typeof body.action !== "object") {
      telemetry.reject("room.command", 400);
      return Response.json({ error: "code and action are required" }, { status: 400 });
    }
    const requestedAction = body.action as Record<string, unknown>;
    if (actionRequiresDebugAccess(requestedAction, player.id)) await requirePlayerDebugAccess(player.id);
    logFields = {
      action: typeof requestedAction.type === "string" ? requestedAction.type : "unknown",
      roomRef: telemetry.roomRef(code),
      actorRef: telemetry.actorRef(player.id),
    };
    if (requestedAction.type === "join-room") {
      const room = await joinStoredTahoiyaRoom(code, {
        id: player.id,
        name: player.name,
        joinedAt: Date.now(),
        avatarColor: player.avatarColor,
        avatarImage: player.avatarImage ?? undefined,
      }, typeof requestedAction.passphrase === "string" ? requestedAction.passphrase : "");
      telemetry.success("room.command", { ...logFields, phase: room.phase, revision: room.revision, playerCount: room.players.length });
      return Response.json({ room: sanitizeTahoiyaRoom(room, player.id) });
    }
    if (requestedAction.type === "start-round") {
      const current = await loadStoredTahoiyaRoom(code);
      if (!current) {
        telemetry.reject("room.command", 404, logFields);
        return Response.json({ error: "Room not found" }, { status: 404 });
      }
      logFields = { ...logFields, phase: current.phase, revision: current.revision, round: current.round, playerCount: current.players.length, debugMode: current.debugMode };
      if (current.hostId !== player.id || current.phase !== "lobby") {
        telemetry.reject("room.command", 403, logFields);
        return Response.json({ error: "Room action is not allowed" }, { status: 403 });
      }
      if (!current.debugMode && current.players.length < 2) {
        telemetry.reject("room.command", 409, logFields);
        return Response.json({ error: "Not enough players" }, { status: 409 });
      }
      const aiLimited = await rateLimitResponseFor(request, rateLimitPolicies.aiGeneration, { playerId: player.id });
      if (aiLimited) return aiLimited;
      const generation = await beginStoredTahoiyaTopicGeneration(code, player.id);
      let roundStarted = false;
      try {
        const generationRoom = generation.room;
        const generated = await withGameGenerationCache("tahoiya-screening-first-v1", `${generationRoom.code}:${generationRoom.round}:${generationRoom.topicDifficulty}`, async () => {
          const response = await generateTahoiyaTopicResponse(
            generationRoom.topicDifficulty,
            generationRoom.players.map((item) => item.id),
            false,
            false,
            async (progress) => {
              await updateStoredTahoiyaTopicGeneration(code, generation.generationId, progress);
            },
          );
          return { status: response.status, body: await response.json() as TahoiyaTopic & { error?: string } };
        }, { shouldCache: (result) => result.status < 400 });
        const topic = generated.body;
        if (generated.status >= 400 || !topic.word || !topic.realDefinition) {
          telemetry.reject("room.command", generated.status, logFields);
          return Response.json({ error: topic.error || "Topic generation failed" }, { status: generated.status });
        }
        await updateStoredTahoiyaTopicGeneration(code, generation.generationId, { stage: "finalizing" });
        const room = await startStoredTahoiyaRound(code, player.id, topic, generation.generationId);
        roundStarted = true;
        telemetry.success("room.command", { ...logFields, phase: room.phase, revision: room.revision, round: room.round });
        return Response.json({ room: sanitizeTahoiyaRoom(room, player.id) });
      } finally {
        if (!roundStarted) await clearStoredTahoiyaTopicGeneration(code, generation.generationId).catch(() => undefined);
      }
    }
    const action = { ...requestedAction, actorId: player.id } as TahoiyaRoomAction;
    const room = await applyStoredTahoiyaRoomAction(code, action);
    telemetry.success("room.command", { ...logFields, phase: room.phase, revision: room.revision, round: room.round });
    return Response.json({ room: sanitizeTahoiyaRoom(room, player.id) });
  } catch (error) {
    const authError = authErrorResponse(error);
    if (authError) {
      telemetry.responseError("room.command", error, authError.status, logFields);
      return authError;
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("room.command", error, 503, logFields);
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_NOT_FOUND") {
      telemetry.responseError("room.command", error, 404, logFields);
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_FORBIDDEN") {
      telemetry.responseError("room.command", error, 403, logFields);
      return Response.json({ error: "Room action is not allowed" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_CONFLICT") {
      telemetry.responseError("room.command", error, 409, logFields);
      return Response.json({ error: "Room update conflicted; retry the action" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_PLAYER_ALREADY_ACTIVE") {
      telemetry.responseError("room.command", error, 409, logFields);
      return Response.json({ error: "Finish or leave the current room before entering another room" }, { status: 409 });
    }
    if (error instanceof Error && (error.message === "GAME_GENERATION_IN_PROGRESS" || error.message === "TAHOIYA_TOPIC_GENERATION_IN_PROGRESS")) {
      telemetry.responseError("room.command", error, 409, logFields);
      return Response.json({ error: "Topic generation is still in progress" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_BAD_PASSPHRASE") {
      telemetry.responseError("room.command", error, 401, logFields);
      return Response.json({ error: "Bad passphrase" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_PLAYERS_NOT_RETURNED") {
      telemetry.responseError("room.command", error, 409, logFields);
      return Response.json({ error: "復帰待ちの参加者がいます。全員が戻ってから開始してください。" }, { status: 409 });
    }
    if (error instanceof Error && (error.message === "TAHOIYA_ROOM_FULL" || error.message === "TAHOIYA_ROOM_STARTED" || error.message === "TAHOIYA_NOT_ENOUGH_PLAYERS" || error.message === "TAHOIYA_ANSWERER_REQUIRED")) {
      telemetry.responseError("room.command", error, 409, logFields);
      return Response.json({ error: error.message }, { status: 409 });
    }
    telemetry.failure("room.command", error, 500, logFields);
    return Response.json({ error: "Failed to update room" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("tahoiya");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/tahoiya/rooms", { game: "tahoiya", operation: "room-delete" });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const ownerId = url.searchParams.get("ownerId");
  const actorId = url.searchParams.get("actorId") ?? "";

  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const logFields: ObservabilityFields = { action: code ? "delete-room" : "delete-hosted-rooms", roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(player.id) };
    if (code) {
      if (actorId && actorId !== player.id) {
        telemetry.reject("room.delete", 403, logFields);
        return Response.json({ error: "Room delete is not allowed" }, { status: 403 });
      }
      await deleteStoredTahoiyaRoom(code, player.id);
      telemetry.success("room.delete", logFields);
      return Response.json({ ok: true });
    }

    if (ownerId) {
      const deleted = await deleteStoredHostedTahoiyaRooms(player.id);
      telemetry.success("room.delete", { ...logFields, affectedCount: deleted });
      return Response.json({ ok: true, deleted });
    }

    telemetry.reject("room.delete", 400, logFields);
    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_IN_PROGRESS") {
      telemetry.reject("room.delete", 409, { roomRef: telemetry.roomRef(code) });
      return Response.json({ error: "An active game cannot be dissolved" }, { status: 409 });
    }
    const authError = authErrorResponse(error);
    if (authError) {
      telemetry.responseError("room.delete", error, authError.status);
      return authError;
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("room.delete", error, 503);
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_FORBIDDEN") {
      telemetry.responseError("room.delete", error, 403);
      return Response.json({ error: "Room delete is not allowed" }, { status: 403 });
    }
    telemetry.failure("room.delete", error);
    return Response.json({ error: "Failed to delete room" }, { status: 500 });
  }
}
