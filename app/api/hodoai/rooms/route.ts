import {
  applyStoredHodoaiAction,
  createStoredHodoaiRoom,
  deleteHostedHodoaiRooms,
  deleteStoredHodoaiRoom,
  listJoinableHodoaiRooms,
  loadAndReconcileHodoaiRoom,
  loadHodoaiPlayerActiveRoom,
  sanitizeHodoaiRoom,
} from "@/lib/hodoai-room-store";
import { requireAuthenticatedPlayer, requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import type { HodoaiRoomAction } from "@/lib/hodoai-talk";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { actionRequiresDebugAccess, requirePlayerDebugAccess } from "@/lib/debug-access";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { authenticatedRoomDraft } from "@/lib/online-room-input";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { conditionalJsonResponse } from "@/lib/conditional-json";

function errorResponse(error: unknown) {
  const common = commonOnlineRoomErrorResponse(error);
  if (common) return common;
  if (error instanceof Error && error.message === "HODOAI_ROOM_NOT_FOUND") return Response.json({ error: "Room not found" }, { status: 404 });
  if (error instanceof Error && error.message === "HODOAI_BAD_PASSPHRASE") return Response.json({ error: "Bad passphrase" }, { status: 401 });
  if (error instanceof Error && error.message === "HODOAI_ROOM_FULL") return Response.json({ error: "Room is full" }, { status: 409 });
  if (error instanceof Error && error.message === "HODOAI_TOO_MANY_CARDS") return Response.json({ error: "Too many cards for this room" }, { status: 409 });
  if (error instanceof Error && error.message === "HODOAI_NOT_ENOUGH_PLAYERS") return Response.json({ error: "Not enough players" }, { status: 409 });
  if (error instanceof Error && error.message === "HODOAI_ROOM_IN_PROGRESS") return Response.json({ error: "An active game cannot be dissolved" }, { status: 409 });
  if (error instanceof Error && error.message === "HODOAI_PLAYER_ALREADY_ACTIVE") return Response.json({ error: "Finish or leave the current room before entering another room" }, { status: 409 });
  if (error instanceof Error && error.message === "HODOAI_INVALID_CLUE") return Response.json({ error: "Invalid clue" }, { status: 400 });
  if (error instanceof Error && error.message === "HODOAI_ROOM_FORBIDDEN") return Response.json({ error: "Room action is not allowed" }, { status: 403 });
  if (error instanceof Error && error.message === "HODOAI_ROOM_CONFLICT") return Response.json({ error: "Room update conflicted; retry" }, { status: 409 });
  if (error instanceof Error && error.message === "INVALID_HODOAI_ROOM") return Response.json({ error: "Invalid room" }, { status: 400 });
  return Response.json({ error: "Failed to update room" }, { status: 500 });
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/hodoai/rooms", { game: "hodoai", operation: "room-read" });
  const accessDenied = await gameApiAccessDeniedResponse("hodoai");
  if (accessDenied) return accessDenied;
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const playerId = url.searchParams.get("playerId")?.trim() ?? "";
  try {
    const authenticatedPlayerId = await requireAuthenticatedPlayerId();
    if (playerId && playerId !== authenticatedPlayerId) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
    if (code) {
      const room = await loadAndReconcileHodoaiRoom(code);
      if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
      if (!room.players.some((player) => player.id === authenticatedPlayerId)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return conditionalJsonResponse(request, { room: sanitizeHodoaiRoom(room, authenticatedPlayerId) });
    }
    if (playerId) {
      const room = await loadHodoaiPlayerActiveRoom(authenticatedPlayerId);
      return conditionalJsonResponse(request, { room: room ? sanitizeHodoaiRoom(room, authenticatedPlayerId) : null });
    }
    return conditionalJsonResponse(request, await listJoinableHodoaiRooms(url.searchParams.get("cursor")));
  } catch (error) {
    const response = errorResponse(error);
    if (response.status >= 500) telemetry.responseError("room.read", error, response.status, { roomRef: telemetry.roomRef(code) });
    return response;
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/hodoai/rooms", { game: "hodoai", operation: "room-create" });
  let logFields: ObservabilityFields = { action: "create-room" };
  const accessDenied = await gameApiAccessDeniedResponse("hodoai");
  if (accessDenied) return accessDenied;
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = (await request.json()) as { room?: unknown; actorId?: unknown };
    const actorId = session.id!;
    const requestedRoom = body.room && typeof body.room === "object" ? body.room as { code?: unknown } : null;
    logFields = { ...logFields, roomRef: telemetry.roomRef(requestedRoom?.code), actorRef: telemetry.actorRef(actorId) };
    const room = await createStoredHodoaiRoom(authenticatedRoomDraft(body.room, session), actorId);
    telemetry.success("room.mutation", { ...logFields, phase: room.phase, revision: room.revision, playerCount: room.players.length });
    return Response.json({ room: sanitizeHodoaiRoom(room, actorId) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.mutation", error, response.status, logFields);
    return response;
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/hodoai/rooms", { game: "hodoai", operation: "room-command" });
  let logFields: ObservabilityFields = {};
  const accessDenied = await gameApiAccessDeniedResponse("hodoai");
  if (accessDenied) return accessDenied;
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = (await request.json()) as { code?: unknown; action?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code || !body.action || typeof body.action !== "object") {
      telemetry.reject("room.command", 400);
      return Response.json({ error: "code and action are required" }, { status: 400 });
    }
    let action = { ...body.action, actorId: session.id! } as HodoaiRoomAction;
    if (actionRequiresDebugAccess(action)) await requirePlayerDebugAccess(session.id!);
    logFields = { action: action.type, roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(session.id) };
    if (action.type === "join-room") {
      action = {
        ...action,
        player: {
          id: session.id!,
          name: session.name,
          joinedAt: Date.now(),
          avatarColor: session.avatarColor,
          avatarImage: session.avatarImage ?? undefined,
          shareNameAllowed: session.shareNameAllowed === true,
        },
      };
    }
    const room = await applyStoredHodoaiAction(code, action);
    telemetry.success("room.command", { ...logFields, phase: room.phase, revision: room.revision, round: room.round, playerCount: room.players.length, debugMode: room.debugMode });
    return Response.json({ room: sanitizeHodoaiRoom(room, action.actorId) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.command", error, response.status, logFields);
    return response;
  }
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/hodoai/rooms", { game: "hodoai", operation: "room-delete" });
  const accessDenied = await gameApiAccessDeniedResponse("hodoai");
  if (accessDenied) return accessDenied;
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const actorId = url.searchParams.get("actorId")?.trim() ?? "";
  const ownerId = url.searchParams.get("ownerId")?.trim() ?? "";
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const authenticatedPlayerId = session.id!;
    const logFields: ObservabilityFields = { action: code ? "delete-room" : "delete-hosted-rooms", roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(authenticatedPlayerId) };
    if (code) {
      if (actorId && actorId !== authenticatedPlayerId) {
        telemetry.reject("room.delete", 403, logFields);
        return Response.json({ error: "Room action is not allowed" }, { status: 403 });
      }
      await deleteStoredHodoaiRoom(code, authenticatedPlayerId);
      telemetry.success("room.delete", logFields);
      return Response.json({ ok: true });
    }
    if (ownerId) {
      const deleted = await deleteHostedHodoaiRooms(ownerId, authenticatedPlayerId);
      telemetry.success("room.delete", { ...logFields, affectedCount: deleted });
      return Response.json({ ok: true, deleted });
    }
    telemetry.reject("room.delete", 400, logFields);
    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.delete", error, response.status, { roomRef: telemetry.roomRef(code) });
    return response;
  }
}
