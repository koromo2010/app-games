import { conditionalJsonResponse } from "@/lib/conditional-json";
import { actionRequiresDebugAccess, requirePlayerDebugAccess } from "@/lib/debug-access";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import type { CodeInterceptRoomAction } from "@/lib/code-intercept";
import {
  applyStoredCodeInterceptAction,
  createStoredCodeInterceptRoom,
  deleteHostedCodeInterceptRooms,
  deleteStoredCodeInterceptRoom,
  listJoinableCodeInterceptRooms,
  loadCodeInterceptPlayerActiveRoom,
  loadStoredCodeInterceptRoom,
  sanitizeCodeInterceptRoom,
} from "@/lib/code-intercept-room-store";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { authenticatedRoomDraft } from "@/lib/online-room-input";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const common = commonOnlineRoomErrorResponse(error);
  if (common) return common;
  if (message === "CODE_INTERCEPT_ROOM_NOT_FOUND") return Response.json({ error: "Room not found" }, { status: 404 });
  if (message === "CODE_INTERCEPT_BAD_PASSPHRASE") return Response.json({ error: "Bad passphrase" }, { status: 401 });
  if (message === "CODE_INTERCEPT_ROOM_FULL") return Response.json({ error: "Room is full" }, { status: 409 });
  if (message === "CODE_INTERCEPT_NOT_ENOUGH_PLAYERS") return Response.json({ error: "Each team needs at least two players and team sizes may differ by at most one" }, { status: 409 });
  if (message === "CODE_INTERCEPT_WORDS_UNAVAILABLE") return Response.json({
    error: "General Game Poolから設定した難易度の単語を取得できませんでした。",
    errorCode: "CODE_INTERCEPT_WORDS_UNAVAILABLE",
  }, { status: 503 });
  if (message === "CODE_INTERCEPT_ROOM_IN_PROGRESS") return Response.json({ error: "An active game cannot be dissolved" }, { status: 409 });
  if (message === "CODE_INTERCEPT_PLAYER_ALREADY_ACTIVE") return Response.json({ error: "Finish or leave the current room before entering another room" }, { status: 409 });
  if (message === "CODE_INTERCEPT_INVALID_CLUE" || message === "CODE_INTERCEPT_INVALID_ANSWER" || message === "CODE_INTERCEPT_INVALID_CONFIG" || message === "CODE_INTERCEPT_INVALID_CODE_LENGTH") return Response.json({ error: "Invalid game input" }, { status: 400 });
  if (message === "CODE_INTERCEPT_ROOM_FORBIDDEN") return Response.json({ error: "Room action is not allowed" }, { status: 403 });
  if (message === "CODE_INTERCEPT_ROOM_CONFLICT") return Response.json({ error: "Room update conflicted; retry" }, { status: 409 });
  if (message === "INVALID_CODE_INTERCEPT_ROOM") return Response.json({ error: "Invalid room" }, { status: 400 });
  return Response.json({ error: "Failed to update room" }, { status: 500 });
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/code-intercept/rooms", { game: "code-intercept", operation: "room-read" });
  const accessDenied = await gameApiAccessDeniedResponse("code-intercept");
  if (accessDenied) return accessDenied;
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const playerId = url.searchParams.get("playerId")?.trim() ?? "";
  try {
    const session = await requireAuthenticatedPlayer();
    if (playerId && playerId !== session.id) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
    if (code) {
      const room = await loadStoredCodeInterceptRoom(code);
      if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
      if (!room.players.some((player) => player.id === session.id)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return conditionalJsonResponse(request, { room: sanitizeCodeInterceptRoom(room, session.id) });
    }
    if (playerId) {
      const room = await loadCodeInterceptPlayerActiveRoom(session.id);
      return conditionalJsonResponse(request, { room: room ? sanitizeCodeInterceptRoom(room, session.id) : null });
    }
    return conditionalJsonResponse(request, await listJoinableCodeInterceptRooms(url.searchParams.get("cursor")));
  } catch (error) {
    const response = errorResponse(error);
    if (response.status >= 500) telemetry.responseError("room.read", error, response.status, { roomRef: telemetry.roomRef(code) });
    return response;
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/code-intercept/rooms", { game: "code-intercept", operation: "room-create" });
  let fields: ObservabilityFields = { action: "create-room" };
  const accessDenied = await gameApiAccessDeniedResponse("code-intercept");
  if (accessDenied) return accessDenied;
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = await request.json() as { room?: unknown };
    const roomDraft = body.room && typeof body.room === "object" ? body.room as { code?: unknown } : null;
    fields = { ...fields, roomRef: telemetry.roomRef(roomDraft?.code), actorRef: telemetry.actorRef(session.id) };
    const room = await createStoredCodeInterceptRoom(authenticatedRoomDraft(body.room, session), session.id);
    telemetry.success("room.mutation", { ...fields, phase: room.phase, revision: room.revision, playerCount: room.players.length });
    return Response.json({ room: sanitizeCodeInterceptRoom(room, session.id) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.mutation", error, response.status, fields);
    return response;
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/code-intercept/rooms", { game: "code-intercept", operation: "room-command" });
  let fields: ObservabilityFields = {};
  const accessDenied = await gameApiAccessDeniedResponse("code-intercept");
  if (accessDenied) return accessDenied;
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = await request.json() as { code?: unknown; action?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code || !body.action || typeof body.action !== "object") return Response.json({ error: "code and action are required" }, { status: 400 });
    let action = { ...body.action, actorId: session.id } as CodeInterceptRoomAction;
    if (actionRequiresDebugAccess(action)) await requirePlayerDebugAccess(session.id);
    fields = { action: action.type, roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(session.id) };
    if (action.type === "join-room") {
      action = { ...action, player: { id: session.id, name: session.name, joinedAt: Date.now(), teamId: "red", avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true } };
    }
    const room = await applyStoredCodeInterceptAction(code, action);
    telemetry.success("room.command", { ...fields, phase: room.phase, revision: room.revision, gameNumber: room.gameNumber, playerCount: room.players.length, debugMode: room.debugMode });
    return Response.json({ room: sanitizeCodeInterceptRoom(room, session.id) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.command", error, response.status, fields);
    return response;
  }
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/code-intercept/rooms", { game: "code-intercept", operation: "room-delete" });
  const accessDenied = await gameApiAccessDeniedResponse("code-intercept");
  if (accessDenied) return accessDenied;
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const actorId = url.searchParams.get("actorId")?.trim() ?? "";
  const ownerId = url.searchParams.get("ownerId")?.trim() ?? "";
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    if (code) {
      if (actorId && actorId !== session.id) return Response.json({ error: "Room action is not allowed" }, { status: 403 });
      await deleteStoredCodeInterceptRoom(code, session.id);
      return Response.json({ ok: true });
    }
    if (ownerId) return Response.json({ ok: true, deleted: await deleteHostedCodeInterceptRooms(ownerId, session.id) });
    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.delete", error, response.status, { roomRef: telemetry.roomRef(code) });
    return response;
  }
}
