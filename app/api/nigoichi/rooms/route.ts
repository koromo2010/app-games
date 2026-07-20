import { conditionalJsonResponse, conditionalVersionedJsonResponse } from "@/lib/conditional-json";
import { actionRequiresDebugAccess, requirePlayerDebugAccess } from "@/lib/debug-access";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import type { NigoichiRoomAction } from "@/lib/nigoichi";
import {
  applyStoredNigoichiAction,
  createStoredNigoichiRoom,
  deleteHostedNigoichiRooms,
  deleteStoredNigoichiRoom,
  listJoinableNigoichiRooms,
  loadNigoichiPlayerActiveRoom,
  loadStoredNigoichiRoom,
  sanitizeNigoichiRoom,
} from "@/lib/nigoichi-room-store";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { authenticatedRoomDraft } from "@/lib/online-room-input";
import { requireAuthenticatedPlayer, requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { assertGameLocaleAvailable, assertRoomLanguageAccess, filterRoomPageByLocale } from "@/lib/game-language";
import { loadStoredPlayerSession } from "@/lib/player-store";

function errorResponse(error: unknown) {
  const common = commonOnlineRoomErrorResponse(error);
  if (common) return common;
  if (error instanceof Error && error.message === "NIGOICHI_ROOM_NOT_FOUND") return Response.json({ error: "Room not found" }, { status: 404 });
  if (error instanceof Error && error.message === "NIGOICHI_BAD_PASSPHRASE") return Response.json({ error: "Bad passphrase" }, { status: 401 });
  if (error instanceof Error && error.message === "NIGOICHI_ROOM_FULL") return Response.json({ error: "Room is full" }, { status: 409 });
  if (error instanceof Error && error.message === "NIGOICHI_NOT_ENOUGH_PLAYERS") return Response.json({ error: "Not enough players" }, { status: 409 });
  if (error instanceof Error && error.message === "NIGOICHI_WORDS_UNAVAILABLE") return Response.json({
    error: "General Game Poolから設定した難易度の単語を取得できませんでした。",
    errorCode: "NIGOICHI_WORDS_UNAVAILABLE",
  }, { status: 503 });
  if (error instanceof Error && error.message === "NIGOICHI_ROOM_IN_PROGRESS") return Response.json({ error: "An active game cannot be dissolved" }, { status: 409 });
  if (error instanceof Error && error.message === "NIGOICHI_PLAYER_ALREADY_ACTIVE") return Response.json({ error: "Finish or leave the current room before entering another room" }, { status: 409 });
  if (error instanceof Error && error.message === "NIGOICHI_INVALID_CLUE") return Response.json({ error: "Invalid clue" }, { status: 400 });
  if (error instanceof Error && error.message === "NIGOICHI_INVALID_CONFIG") return Response.json({ error: "Invalid game configuration" }, { status: 400 });
  if (error instanceof Error && error.message === "NIGOICHI_INVALID_GUESS") return Response.json({ error: "Invalid guess" }, { status: 400 });
  if (error instanceof Error && error.message === "NIGOICHI_ROOM_FORBIDDEN") return Response.json({ error: "Room action is not allowed" }, { status: 403 });
  if (error instanceof Error && error.message === "NIGOICHI_ROOM_CONFLICT") return Response.json({ error: "Room update conflicted; retry" }, { status: 409 });
  if (error instanceof Error && error.message === "INVALID_NIGOICHI_ROOM") return Response.json({ error: "Invalid room" }, { status: 400 });
  return Response.json({ error: "Failed to update room" }, { status: 500 });
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/nigoichi/rooms", { game: "nigoichi", operation: "room-read" });
  const accessDenied = await gameApiAccessDeniedResponse("nigoichi");
  if (accessDenied) return accessDenied;
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const playerId = url.searchParams.get("playerId")?.trim() ?? "";
  try {
    const authenticatedPlayerId = await requireAuthenticatedPlayerId();
    if (playerId && playerId !== authenticatedPlayerId) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
    if (code) {
      const room = await loadStoredNigoichiRoom(code);
      if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
      if (!room.players.some((player) => player.id === authenticatedPlayerId)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return conditionalVersionedJsonResponse(request, `nigoichi:${room.code}:${room.revision}:${authenticatedPlayerId}`, () => ({ room: sanitizeNigoichiRoom(room, authenticatedPlayerId) }));
    }
    if (playerId) {
      const room = await loadNigoichiPlayerActiveRoom(authenticatedPlayerId);
      return room ? conditionalVersionedJsonResponse(request, `nigoichi:${room.code}:${room.revision}:${authenticatedPlayerId}`, () => ({ room: sanitizeNigoichiRoom(room, authenticatedPlayerId) })) : conditionalJsonResponse(request, { room: null });
    }
    const session = await loadStoredPlayerSession(authenticatedPlayerId);
    const page = await listJoinableNigoichiRooms(url.searchParams.get("cursor"));
    return conditionalJsonResponse(request, filterRoomPageByLocale(page, session?.locale));
  } catch (error) {
    const response = errorResponse(error);
    if (response.status >= 500) telemetry.responseError("room.read", error, response.status, { roomRef: telemetry.roomRef(code) });
    return response;
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/nigoichi/rooms", { game: "nigoichi", operation: "room-create" });
  let logFields: ObservabilityFields = { action: "create-room" };
  const accessDenied = await gameApiAccessDeniedResponse("nigoichi");
  if (accessDenied) return accessDenied;
  try {
    const session = await requireAuthenticatedPlayer();
    assertGameLocaleAvailable("nigoichi", session.locale);
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = await request.json() as { room?: unknown; actorId?: unknown };
    const requestedRoom = body.room && typeof body.room === "object" ? body.room as { code?: unknown } : null;
    logFields = { ...logFields, roomRef: telemetry.roomRef(requestedRoom?.code), actorRef: telemetry.actorRef(session.id) };
    const room = await createStoredNigoichiRoom(authenticatedRoomDraft(body.room, session), session.id);
    telemetry.success("room.mutation", { ...logFields, phase: room.phase, revision: room.revision, playerCount: room.players.length });
    return Response.json({ room: sanitizeNigoichiRoom(room, session.id) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.mutation", error, response.status, logFields);
    return response;
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/nigoichi/rooms", { game: "nigoichi", operation: "room-command" });
  let logFields: ObservabilityFields = {};
  const accessDenied = await gameApiAccessDeniedResponse("nigoichi");
  if (accessDenied) return accessDenied;
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = await request.json() as { code?: unknown; action?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code || !body.action || typeof body.action !== "object") return Response.json({ error: "code and action are required" }, { status: 400 });
    let action = { ...body.action, actorId: session.id } as NigoichiRoomAction;
    if (actionRequiresDebugAccess(action)) await requirePlayerDebugAccess(session.id);
    logFields = { action: action.type, roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(session.id) };
    if (action.type === "join-room") {
      const targetRoom = await loadStoredNigoichiRoom(code);
      if (!targetRoom) throw new Error("NIGOICHI_ROOM_NOT_FOUND");
      assertRoomLanguageAccess(targetRoom, session.locale);
      action = {
        ...action,
        player: {
          id: session.id,
          name: session.name,
          joinedAt: Date.now(),
          avatarColor: session.avatarColor,
          avatarImage: session.avatarImage ?? undefined,
          shareNameAllowed: session.shareNameAllowed === true,
        },
      };
    }
    const room = await applyStoredNigoichiAction(code, action);
    telemetry.success("room.command", { ...logFields, phase: room.phase, revision: room.revision, gameNumber: room.gameNumber, playerCount: room.players.length, debugMode: room.debugMode });
    return Response.json({ room: sanitizeNigoichiRoom(room, session.id) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.command", error, response.status, logFields);
    return response;
  }
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/nigoichi/rooms", { game: "nigoichi", operation: "room-delete" });
  const accessDenied = await gameApiAccessDeniedResponse("nigoichi");
  if (accessDenied) return accessDenied;
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const actorId = url.searchParams.get("actorId")?.trim() ?? "";
  const ownerId = url.searchParams.get("ownerId")?.trim() ?? "";
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const logFields: ObservabilityFields = { action: code ? "delete-room" : "delete-hosted-rooms", roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(session.id) };
    if (code) {
      if (actorId && actorId !== session.id) return Response.json({ error: "Room action is not allowed" }, { status: 403 });
      await deleteStoredNigoichiRoom(code, session.id);
      telemetry.success("room.delete", logFields);
      return Response.json({ ok: true });
    }
    if (ownerId) {
      const deleted = await deleteHostedNigoichiRooms(ownerId, session.id);
      telemetry.success("room.delete", { ...logFields, affectedCount: deleted });
      return Response.json({ ok: true, deleted });
    }
    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.delete", error, response.status, { roomRef: telemetry.roomRef(code) });
    return response;
  }
}
