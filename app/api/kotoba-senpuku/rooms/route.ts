import {
  applyStoredKotobaSenpukuAction,
  createStoredKotobaSenpukuRoom,
  deleteHostedKotobaSenpukuRooms,
  deleteStoredKotobaSenpukuRoom,
  listJoinableKotobaSenpukuRooms,
  loadAndReconcileKotobaSenpukuRoom,
  loadKotobaSenpukuPlayerActiveRoom,
  sanitizeKotobaSenpukuRoom,
} from "@/lib/kotoba-senpuku-room-store";
import type { KotobaSenpukuRoomAction } from "@/lib/kotoba-senpuku";
import { requireAuthenticatedPlayer, requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { actionRequiresDebugAccess, requirePlayerDebugAccess } from "@/lib/debug-access";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { authenticatedRoomDraft } from "@/lib/online-room-input";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { conditionalJsonResponse } from "@/lib/conditional-json";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const common = commonOnlineRoomErrorResponse(error);
  if (common) return common;
  if (message === "KOTOBA_SENPUKU_ROOM_NOT_FOUND") return Response.json({ error: "Room not found" }, { status: 404 });
  if (message === "KOTOBA_SENPUKU_BAD_PASSPHRASE") return Response.json({ error: "Bad passphrase" }, { status: 401 });
  if (message === "KOTOBA_SENPUKU_ROOM_FULL") return Response.json({ error: "Room is full" }, { status: 409 });
  if (message === "KOTOBA_SENPUKU_NOT_ENOUGH_PLAYERS") return Response.json({ error: "Not enough players" }, { status: 409 });
  if (message === "KOTOBA_SENPUKU_ROOM_IN_PROGRESS") return Response.json({ error: "An active game cannot be dissolved" }, { status: 409 });
  if (message === "KOTOBA_SENPUKU_PLAYER_ALREADY_ACTIVE") return Response.json({ error: "Finish or leave the current room before entering another room" }, { status: 409 });
  if (message === "KOTOBA_SENPUKU_NOT_YOUR_TURN" || message === "KOTOBA_SENPUKU_ROOM_FORBIDDEN") return Response.json({ error: "Room action is not allowed" }, { status: 403 });
  if (message === "KOTOBA_SENPUKU_INVALID_WORD") return Response.json({ error: "Invalid secret word" }, { status: 400 });
  if (message === "KOTOBA_SENPUKU_WORD_TOO_SHORT") return Response.json({ error: "Secret word is too short" }, { status: 400 });
  if (message === "KOTOBA_SENPUKU_INVALID_KANA" || message === "KOTOBA_SENPUKU_INVALID_TARGET") return Response.json({ error: "Invalid battle action" }, { status: 400 });
  if (message === "KOTOBA_SENPUKU_ROOM_CONFLICT") return Response.json({ error: "Room update conflicted; retry" }, { status: 409 });
  if (message === "INVALID_KOTOBA_SENPUKU_ROOM") return Response.json({ error: "Invalid room" }, { status: 400 });
  return Response.json({ error: "Failed to update room" }, { status: 500 });
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/kotoba-senpuku/rooms", { game: "kotoba-senpuku", operation: "room-read" });
  const accessDenied = await gameApiAccessDeniedResponse("kotoba-senpuku");
  if (accessDenied) return accessDenied;
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const playerId = url.searchParams.get("playerId")?.trim() ?? "";
  try {
    const authenticatedPlayerId = await requireAuthenticatedPlayerId();
    if (playerId && playerId !== authenticatedPlayerId) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
    if (code) {
      const room = await loadAndReconcileKotobaSenpukuRoom(code);
      if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
      if (!room.players.some((player) => player.id === authenticatedPlayerId)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return conditionalJsonResponse(request, { room: sanitizeKotobaSenpukuRoom(room, authenticatedPlayerId) });
    }
    if (playerId) {
      const room = await loadKotobaSenpukuPlayerActiveRoom(authenticatedPlayerId);
      return conditionalJsonResponse(request, { room: room ? sanitizeKotobaSenpukuRoom(room, authenticatedPlayerId) : null });
    }
    return conditionalJsonResponse(request, await listJoinableKotobaSenpukuRooms(url.searchParams.get("cursor")));
  } catch (error) {
    const response = errorResponse(error);
    if (response.status >= 500) telemetry.responseError("room.read", error, response.status, { roomRef: telemetry.roomRef(code) });
    return response;
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/kotoba-senpuku/rooms", { game: "kotoba-senpuku", operation: "room-create" });
  let logFields: ObservabilityFields = { action: "create-room" };
  const accessDenied = await gameApiAccessDeniedResponse("kotoba-senpuku");
  if (accessDenied) return accessDenied;
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = (await request.json()) as { room?: unknown; actorId?: unknown };
    const actorId = session.id!;
    const requestedRoom = body.room && typeof body.room === "object" ? body.room as { code?: unknown } : null;
    logFields = { ...logFields, roomRef: telemetry.roomRef(requestedRoom?.code), actorRef: telemetry.actorRef(actorId) };
    const room = await createStoredKotobaSenpukuRoom(authenticatedRoomDraft(body.room, session), actorId);
    telemetry.success("room.mutation", { ...logFields, phase: room.phase, revision: room.revision, playerCount: room.players.length });
    return Response.json({ room: sanitizeKotobaSenpukuRoom(room, actorId) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.mutation", error, response.status, logFields);
    return response;
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/kotoba-senpuku/rooms", { game: "kotoba-senpuku", operation: "room-command" });
  let logFields: ObservabilityFields = {};
  const accessDenied = await gameApiAccessDeniedResponse("kotoba-senpuku");
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
    const actorId = session.id!;
    let action = { ...body.action, actorId } as KotobaSenpukuRoomAction;
    if (actionRequiresDebugAccess(action)) await requirePlayerDebugAccess(actorId);
    logFields = { action: action.type, roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(actorId) };
    if (action.type === "join-room") {
      action = { ...action, player: { id: session.id!, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined } };
    }
    const room = await applyStoredKotobaSenpukuAction(code, action);
    telemetry.success("room.command", { ...logFields, phase: room.phase, revision: room.revision, round: room.round, playerCount: room.players.length, debugMode: room.debugMode });
    return Response.json({ room: sanitizeKotobaSenpukuRoom(room, actorId) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.command", error, response.status, logFields);
    return response;
  }
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/kotoba-senpuku/rooms", { game: "kotoba-senpuku", operation: "room-delete" });
  const accessDenied = await gameApiAccessDeniedResponse("kotoba-senpuku");
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
      await deleteStoredKotobaSenpukuRoom(code, authenticatedPlayerId);
      telemetry.success("room.delete", logFields);
      return Response.json({ ok: true });
    }
    if (ownerId) {
      const deleted = await deleteHostedKotobaSenpukuRooms(ownerId, authenticatedPlayerId);
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
