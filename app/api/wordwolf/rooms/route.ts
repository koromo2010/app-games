import {
  deleteStoredHostedWordWolfRooms,
  deleteStoredWordWolfRoom,
  listStoredJoinableWordWolfRooms,
  joinStoredWordWolfRoom,
  loadStoredPlayerActiveRoom,
  loadStoredWordWolfRoom,
  sanitizeWordWolfRoom,
  saveStoredWordWolfRoomAsHost,
} from "@/lib/wordwolf-room-store";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer } from "@/lib/player-auth";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/rooms", { game: "wordwolf", operation: "room-read" });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const playerId = url.searchParams.get("playerId");

  try {
    const player = await requireAuthenticatedPlayer();
    if (playerId && playerId !== player.id) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
    if (code) {
      const room = await loadStoredWordWolfRoom(code);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      if (!room.players.some((item) => item.id === player.id)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return Response.json({ room: sanitizeWordWolfRoom(room, player.id) });
    }

    if (playerId) {
      const room = await loadStoredPlayerActiveRoom(player.id);
      return Response.json({ room: room ? sanitizeWordWolfRoom(room, player.id) : null });
    }

    const rooms = await listStoredJoinableWordWolfRooms();
    return Response.json({ rooms });
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
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/rooms", { game: "wordwolf", operation: "room-mutation" });
  let logFields: ObservabilityFields = {};
  try {
    const player = await requireAuthenticatedPlayer();
    const body = (await request.json()) as { room?: unknown; action?: unknown; code?: unknown; passphrase?: unknown };
    const requestedRoom = body.room && typeof body.room === "object" ? body.room as { code?: unknown } : null;
    logFields = {
      action: body.action === "join" ? "join-room" : "save-room",
      roomRef: telemetry.roomRef(body.action === "join" ? body.code : requestedRoom?.code),
      actorRef: telemetry.actorRef(player.id),
    };
    const room = body.action === "join"
      ? await joinStoredWordWolfRoom(
          typeof body.code === "string" ? body.code : "",
          { id: player.id, name: player.name, joinedAt: Date.now(), avatarColor: player.avatarColor, avatarImage: player.avatarImage ?? undefined },
          typeof body.passphrase === "string" ? body.passphrase : "",
        )
      : await saveStoredWordWolfRoomAsHost(body.room, player.id);
    telemetry.success("room.mutation", { ...logFields, phase: room.phase, revision: room.revision, playerCount: room.players.length, debugMode: room.debugMode });
    return Response.json({ room: sanitizeWordWolfRoom(room, player.id) });
  } catch (error) {
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
    if (error instanceof Error && error.message === "WORDWOLF_BAD_PASSPHRASE") {
      telemetry.responseError("room.mutation", error, 401, logFields);
      return Response.json({ error: "Bad passphrase" }, { status: 401 });
    }

    telemetry.failure("room.mutation", error, 500, logFields);
    return Response.json({ error: "Failed to save room" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/wordwolf/rooms", { game: "wordwolf", operation: "room-delete" });
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const ownerId = url.searchParams.get("ownerId");

  try {
    const player = await requireAuthenticatedPlayer();
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
