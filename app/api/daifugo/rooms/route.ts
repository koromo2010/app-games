import { conditionalJsonResponse } from "@/lib/conditional-json";
import { actionRequiresDebugAccess, requirePlayerDebugAccess } from "@/lib/debug-access";
import type { DaifugoRoomAction } from "@/lib/daifugo-room";
import { applyStoredDaifugoAction, createStoredDaifugoRoom, deleteHostedDaifugoRooms, deleteStoredDaifugoRoom, listJoinableDaifugoRooms, loadDaifugoPlayerActiveRoom, loadStoredDaifugoRoom, sanitizeDaifugoRoom } from "@/lib/daifugo-room-store";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { createRequestTelemetry, type ObservabilityFields } from "@/lib/observability";
import { authenticatedRoomDraft } from "@/lib/online-room-input";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { requireAuthenticatedPlayer, requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";

function errorResponse(error: unknown) {
  const common = commonOnlineRoomErrorResponse(error);
  if (common) return common;
  const message = error instanceof Error ? error.message : "";
  const responses: Record<string, [string, number]> = {
    DAIFUGO_ROOM_NOT_FOUND: ["Room not found", 404],
    DAIFUGO_BAD_PASSPHRASE: ["Bad passphrase", 401],
    DAIFUGO_ROOM_FULL: ["Room is full", 409],
    DAIFUGO_NOT_ENOUGH_PLAYERS: ["Not enough players", 409],
    DAIFUGO_ROOM_IN_PROGRESS: ["An active game cannot be dissolved", 409],
    DAIFUGO_PLAYER_ALREADY_ACTIVE: ["Finish or leave the current room before entering another room", 409],
    DAIFUGO_INVALID_CONFIG: ["Invalid game configuration", 400],
    DAIFUGO_INVALID_PLAY: ["Invalid play", 400],
    DAIFUGO_ROOM_FORBIDDEN: ["Room action is not allowed", 403],
    DAIFUGO_ROOM_CONFLICT: ["Room update conflicted; retry", 409],
    INVALID_DAIFUGO_ROOM: ["Invalid room", 400],
  };
  const response = responses[message];
  return response ? Response.json({ error: response[0] }, { status: response[1] }) : Response.json({ error: "Failed to update room" }, { status: 500 });
}

export async function GET(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/daifugo/rooms", { game: "daifugo", operation: "room-read" });
  const accessDenied = await gameApiAccessDeniedResponse("daifugo");
  if (accessDenied) return accessDenied;
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const playerId = url.searchParams.get("playerId")?.trim() ?? "";
  try {
    const authenticatedPlayerId = await requireAuthenticatedPlayerId();
    if (playerId && playerId !== authenticatedPlayerId) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
    if (code) {
      const room = await loadStoredDaifugoRoom(code);
      if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
      if (!room.players.some((player) => player.id === authenticatedPlayerId)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return conditionalJsonResponse(request, { room: sanitizeDaifugoRoom(room, authenticatedPlayerId) });
    }
    if (playerId) {
      const room = await loadDaifugoPlayerActiveRoom(authenticatedPlayerId);
      return conditionalJsonResponse(request, { room: room ? sanitizeDaifugoRoom(room, authenticatedPlayerId) : null });
    }
    return conditionalJsonResponse(request, await listJoinableDaifugoRooms(url.searchParams.get("cursor")));
  } catch (error) {
    const response = errorResponse(error);
    if (response.status >= 500) telemetry.responseError("room.read", error, response.status, { roomRef: telemetry.roomRef(code) });
    return response;
  }
}

export async function POST(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/daifugo/rooms", { game: "daifugo", operation: "room-create" });
  let fields: ObservabilityFields = { action: "create-room" };
  const accessDenied = await gameApiAccessDeniedResponse("daifugo");
  if (accessDenied) return accessDenied;
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = await request.json() as { room?: unknown };
    fields = { ...fields, actorRef: telemetry.actorRef(session.id) };
    const room = await createStoredDaifugoRoom(authenticatedRoomDraft(body.room, session), session.id);
    telemetry.success("room.mutation", { ...fields, phase: room.phase, revision: room.revision, playerCount: room.players.length });
    return Response.json({ room: sanitizeDaifugoRoom(room, session.id) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.mutation", error, response.status, fields);
    return response;
  }
}

export async function PATCH(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/daifugo/rooms", { game: "daifugo", operation: "room-command" });
  let fields: ObservabilityFields = {};
  const accessDenied = await gameApiAccessDeniedResponse("daifugo");
  if (accessDenied) return accessDenied;
  try {
    const session = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id });
    if (limited) return limited;
    const body = await request.json() as { code?: unknown; action?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code || !body.action || typeof body.action !== "object") return Response.json({ error: "code and action are required" }, { status: 400 });
    let action = { ...body.action, actorId: session.id } as DaifugoRoomAction;
    if (actionRequiresDebugAccess(action)) await requirePlayerDebugAccess(session.id);
    fields = { action: action.type, roomRef: telemetry.roomRef(code), actorRef: telemetry.actorRef(session.id) };
    if (action.type === "join-room") action = { ...action, player: { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined, shareNameAllowed: session.shareNameAllowed === true } };
    const room = await applyStoredDaifugoAction(code, action);
    telemetry.success("room.command", { ...fields, phase: room.phase, revision: room.revision, gameNumber: room.gameNumber, playerCount: room.players.length, debugMode: room.debugMode });
    return Response.json({ room: sanitizeDaifugoRoom(room, session.id) });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.command", error, response.status, fields);
    return response;
  }
}

export async function DELETE(request: Request) {
  const telemetry = createRequestTelemetry(request, "/api/daifugo/rooms", { game: "daifugo", operation: "room-delete" });
  const accessDenied = await gameApiAccessDeniedResponse("daifugo");
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
      await deleteStoredDaifugoRoom(code, session.id);
      return Response.json({ ok: true });
    }
    if (ownerId) return Response.json({ ok: true, deleted: await deleteHostedDaifugoRooms(ownerId, session.id) });
    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    const response = errorResponse(error);
    telemetry.responseError("room.delete", error, response.status, { roomRef: telemetry.roomRef(code) });
    return response;
  }
}
