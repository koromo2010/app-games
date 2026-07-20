import {
  deleteStoredHostedWordWolfRooms,
  deleteStoredWordWolfRoom,
  listStoredJoinableWordWolfRooms,
  joinStoredWordWolfRoom,
  loadStoredPlayerActiveRoom,
  loadStoredWordWolfRoom,
  applyStoredWordWolfRoomAction,
  sanitizeWordWolfRoom,
  createStoredWordWolfRoom,
} from "@/lib/wordwolf-room-store";
import type { WordWolfRoomAction } from "@/lib/wordwolf-game-types";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer, requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { authenticatedRoomDraft } from "@/lib/online-room-input";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { actionRequiresDebugAccess, requirePlayerDebugAccess, roomRequestsDebugMode } from "@/lib/debug-access";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { conditionalJsonResponse } from "@/lib/conditional-json";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("wordwolf");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/rooms", { game: "wordwolf", operation: "room-read" });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const playerId = url.searchParams.get("playerId");

  try {
    const authenticatedPlayerId = await requireAuthenticatedPlayerId();
    if (playerId && playerId !== authenticatedPlayerId) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
    if (code) {
      const room = await loadStoredWordWolfRoom(code);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      if (!room.players.some((item) => item.id === authenticatedPlayerId)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return conditionalJsonResponse(request, { room: sanitizeWordWolfRoom(room, authenticatedPlayerId) });
    }

    if (playerId) {
      const room = await loadStoredPlayerActiveRoom(authenticatedPlayerId);
      return conditionalJsonResponse(request, { room: room ? sanitizeWordWolfRoom(room, authenticatedPlayerId) : null });
    }

    const page = await listStoredJoinableWordWolfRooms(url.searchParams.get("cursor"));
    return conditionalJsonResponse(request, page);
  } catch (error) {
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("room.read", error, 503, { roomRef: telemetry.roomRef(code) });
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
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
  const accessDenied = await gameApiAccessDeniedResponse("wordwolf");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/rooms", { game: "wordwolf", operation: "room-create" });
  let logFields: ObservabilityFields = {};
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const body = (await request.json()) as { room?: unknown };
    const requestedRoom = body.room && typeof body.room === "object" ? body.room as { code?: unknown } : null;
    if (roomRequestsDebugMode(requestedRoom)) await requirePlayerDebugAccess(player.id);
    logFields = {
      action: "create-room",
      roomRef: telemetry.roomRef(requestedRoom?.code),
      actorRef: telemetry.actorRef(player.id),
    };
    const room = await createStoredWordWolfRoom(authenticatedRoomDraft(body.room, player), player.id);
    telemetry.success("room.mutation", { ...logFields, phase: room.phase, revision: room.revision, playerCount: room.players.length, debugMode: room.debugMode });
    return Response.json({ room: sanitizeWordWolfRoom(room, player.id) });
  } catch (error) {
    if (error instanceof Error && error.message === "DEBUG_ACCESS_REQUIRED") {
      telemetry.responseError("room.mutation", error, 403, logFields);
      return Response.json({ error: "Debug access required" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("room.mutation", error, 401, logFields);
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("room.mutation", error, 503, logFields);
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("room.mutation", error, 503, logFields);
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }

    if (error instanceof Error && error.message === "INVALID_WORDWOLF_ROOM") {
      telemetry.responseError("room.mutation", error, 400, logFields);
      return Response.json({ error: "Invalid room" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "WORDWOLF_ROOM_CONFLICT") {
      telemetry.responseError("room.mutation", error, 409, logFields);
      return Response.json({ error: "Room was updated by another player" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "WORDWOLF_PLAYER_ALREADY_ACTIVE") {
      telemetry.responseError("room.mutation", error, 409, logFields);
      return Response.json({ error: "Finish or leave the current room before entering another room" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "WORDWOLF_ROOM_FORBIDDEN") {
      telemetry.responseError("room.mutation", error, 403, logFields);
      return Response.json({ error: "Room update is not allowed" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "WORDWOLF_ROOM_NOT_FOUND") {
      telemetry.responseError("room.mutation", error, 404, logFields);
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "WORDWOLF_ROOM_STARTED") {
      telemetry.responseError("room.mutation", error, 409, logFields);
      return Response.json({ error: "Room already started" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "WORDWOLF_ROOM_FULL") {
      telemetry.responseError("room.mutation", error, 409, logFields);
      return Response.json({ error: "Room is full" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "WORDWOLF_BAD_PASSPHRASE") {
      telemetry.responseError("room.mutation", error, 401, logFields);
      return Response.json({ error: "Bad passphrase" }, { status: 401 });
    }

    telemetry.failure("room.mutation", error, 500, logFields);
    return Response.json({ error: "Failed to save room" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("wordwolf");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/rooms", { game: "wordwolf", operation: "room-command" });
  let logFields: ObservabilityFields = {};
  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const body = (await request.json()) as { code?: unknown; action?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code || !body.action || typeof body.action !== "object") return Response.json({ error: "code and action are required" }, { status: 400 });
    const action = body.action as WordWolfRoomAction;
    if (actionRequiresDebugAccess(action)) await requirePlayerDebugAccess(player.id);
    logFields = { action: action.type, roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(player.id) };
    const room = action.type === "join-room"
      ? await joinStoredWordWolfRoom(code, { id: player.id, name: player.name, joinedAt: Date.now(), avatarColor: player.avatarColor, avatarImage: player.avatarImage ?? undefined }, action.passphrase)
      : await applyStoredWordWolfRoomAction(code, player.id, action);
    telemetry.success("room.command", { ...logFields, phase: room.phase, revision: room.revision, playerCount: room.players.length, debugMode: room.debugMode });
    return Response.json({ room: sanitizeWordWolfRoom(room, player.id) });
  } catch (error) {
    if (error instanceof Error && error.message === "DEBUG_ACCESS_REQUIRED") return Response.json({ error: "Debug access required" }, { status: 403 });
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
    if (isPlayerAuthConfigurationError(error)) return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    if (isStoreNotConfigured(error)) return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    const status = error instanceof Error && error.message === "WORDWOLF_BAD_PASSPHRASE" ? 401
      : error instanceof Error && error.message === "WORDWOLF_ROOM_NOT_FOUND" ? 404
        : error instanceof Error && error.message === "WORDWOLF_ROOM_FORBIDDEN" ? 403
          : error instanceof Error && ["WORDWOLF_ROOM_CONFLICT", "WORDWOLF_PLAYER_ALREADY_ACTIVE", "WORDWOLF_ROOM_STARTED", "WORDWOLF_ROOM_FULL"].includes(error.message) ? 409
            : 500;
    telemetry.responseError("room.command", error, status, logFields);
    return Response.json({ error: status === 500 ? "Failed to update room" : error instanceof Error ? error.message : "Room command failed" }, { status });
  }
}

export async function DELETE(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("wordwolf");
  if (accessDenied) return accessDenied;
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/rooms", { game: "wordwolf", operation: "room-delete" });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const ownerId = url.searchParams.get("ownerId");

  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;
    const logFields: ObservabilityFields = { action: code ? "delete-room" : "delete-hosted-rooms", roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(player.id) };
    if (code) {
      const room = await loadStoredWordWolfRoom(code);
      if (room && room.hostId !== player.id) {
        telemetry.reject("room.delete", 403, logFields);
        return Response.json({ error: "Room delete is not allowed" }, { status: 403 });
      }
      await deleteStoredWordWolfRoom(code);
      telemetry.success("room.delete", logFields);
      return Response.json({ ok: true });
    }

    if (ownerId) {
      const deleted = await deleteStoredHostedWordWolfRooms(player.id);
      telemetry.success("room.delete", { ...logFields, affectedCount: deleted });
      return Response.json({ ok: true, deleted });
    }

    telemetry.reject("room.delete", 400, logFields);
    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "WORDWOLF_ROOM_IN_PROGRESS") {
      telemetry.reject("room.delete", 409, { roomRef: telemetry.roomRef(code) });
      return Response.json({ error: "An active game cannot be dissolved" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") {
      telemetry.responseError("room.delete", error, 401);
      return Response.json({ error: "Login required" }, { status: 401 });
    }
    if (isPlayerAuthConfigurationError(error)) {
      telemetry.responseError("room.delete", error, 503);
      return Response.json({ error: "Player auth is not configured" }, { status: 503 });
    }
    if (isStoreNotConfigured(error)) {
      telemetry.responseError("room.delete", error, 503);
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }

    telemetry.failure("room.delete", error);
    return Response.json({ error: "Failed to delete room" }, { status: 500 });
  }
}
