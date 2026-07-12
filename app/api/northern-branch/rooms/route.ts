import { cookies } from "next/headers";
import {
  applyStoredNorthernAction,
  createStoredNorthernRoom,
  deleteHostedNorthernRooms,
  deleteStoredNorthernRoom,
  listJoinableNorthernRooms,
  loadNorthernPlayerActiveRoom,
  loadStoredNorthernRoom,
  sanitizeNorthernRoom,
} from "@/lib/northern-branch-room-store";
import type { NorthernRoomAction } from "@/lib/northern-branch-types";
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";
import { loadStoredPlayerSession } from "@/lib/player-store";

async function hasPrivateAccess() {
  const store = await cookies();
  return privateGameCookieMatches(store.get(privateGameCookieName)?.value);
}

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED") return Response.json({ error: "Room storage is not configured" }, { status: 503 });
  if (error instanceof Error && error.message === "NORTHERN_ROOM_NOT_FOUND") return Response.json({ error: "Room not found" }, { status: 404 });
  if (error instanceof Error && error.message === "NORTHERN_BAD_PASSPHRASE") return Response.json({ error: "Bad passphrase" }, { status: 401 });
  if (error instanceof Error && error.message === "NORTHERN_ROOM_FULL") return Response.json({ error: "Room is full" }, { status: 409 });
  if (error instanceof Error && error.message === "NORTHERN_NOT_ENOUGH_PLAYERS") return Response.json({ error: "Not enough players" }, { status: 409 });
  if (error instanceof Error && error.message === "NORTHERN_NOT_YOUR_TURN") return Response.json({ error: "Not your turn" }, { status: 403 });
  if (error instanceof Error && error.message.startsWith("NORTHERN_ACTION_INVALID:")) return Response.json({ error: error.message.slice("NORTHERN_ACTION_INVALID:".length) }, { status: 400 });
  if (error instanceof Error && error.message === "NORTHERN_ROOM_FORBIDDEN") return Response.json({ error: "Room action is not allowed" }, { status: 403 });
  if (error instanceof Error && error.message === "NORTHERN_ROOM_CONFLICT") return Response.json({ error: "Room update conflicted; retry" }, { status: 409 });
  if (error instanceof Error && error.message === "INVALID_NORTHERN_ROOM") return Response.json({ error: "Invalid room" }, { status: 400 });
  return Response.json({ error: "Failed to update room" }, { status: 500 });
}

export async function GET(request: Request) {
  if (!(await hasPrivateAccess())) return Response.json({ error: "Private access required" }, { status: 403 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const playerId = url.searchParams.get("playerId")?.trim() ?? "";
  try {
    if (code) {
      if (!playerId) return Response.json({ error: "playerId is required" }, { status: 400 });
      if (!(await loadStoredPlayerSession(playerId))) return Response.json({ error: "Login required" }, { status: 401 });
      const room = await loadStoredNorthernRoom(code);
      if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
      if (!room.players.some((player) => player.id === playerId)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return Response.json({ room: sanitizeNorthernRoom(room, playerId) });
    }
    if (playerId) {
      if (!(await loadStoredPlayerSession(playerId))) return Response.json({ error: "Login required" }, { status: 401 });
      const room = await loadNorthernPlayerActiveRoom(playerId);
      return Response.json({ room: room ? sanitizeNorthernRoom(room, playerId) : null });
    }
    return Response.json({ rooms: await listJoinableNorthernRooms() });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  if (!(await hasPrivateAccess())) return Response.json({ error: "Private access required" }, { status: 403 });
  try {
    const body = (await request.json()) as { room?: unknown; actorId?: unknown };
    const actorId = typeof body.actorId === "string" ? body.actorId : "";
    if (!actorId) return Response.json({ error: "actorId is required" }, { status: 400 });
    if (!(await loadStoredPlayerSession(actorId))) return Response.json({ error: "Login required" }, { status: 401 });
    const room = await createStoredNorthernRoom(body.room, actorId);
    return Response.json({ room: sanitizeNorthernRoom(room, actorId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  if (!(await hasPrivateAccess())) return Response.json({ error: "Private access required" }, { status: 403 });
  try {
    const body = (await request.json()) as { code?: unknown; action?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code || !body.action || typeof body.action !== "object") return Response.json({ error: "code and action are required" }, { status: 400 });
    const actorId = typeof (body.action as { actorId?: unknown }).actorId === "string"
      ? (body.action as { actorId: string }).actorId
      : "";
    if (!actorId) return Response.json({ error: "actorId is required" }, { status: 400 });
    let action = { ...body.action, actorId } as NorthernRoomAction;
    const session = await loadStoredPlayerSession(actorId);
    if (!session?.id) return Response.json({ error: "Login required" }, { status: 401 });
    if (action.type === "join-room") {
      action = {
        ...action,
        player: {
          id: session.id,
          name: session.name,
          joinedAt: Date.now(),
          avatarColor: session.avatarColor,
          avatarImage: session.avatarImage ?? undefined,
        },
      };
    }
    const room = await applyStoredNorthernAction(code, action);
    return Response.json({ room: sanitizeNorthernRoom(room, action.actorId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  if (!(await hasPrivateAccess())) return Response.json({ error: "Private access required" }, { status: 403 });
  const url = new URL(request.url);
  const code = url.searchParams.get("code")?.trim().toUpperCase() ?? "";
  const actorId = url.searchParams.get("actorId")?.trim() ?? "";
  const ownerId = url.searchParams.get("ownerId")?.trim() ?? "";
  const fallbackHostId = url.searchParams.get("fallbackHostId")?.trim() ?? "";
  try {
    if (code) {
      if (!actorId) return Response.json({ error: "actorId is required" }, { status: 400 });
      if (!(await loadStoredPlayerSession(actorId))) return Response.json({ error: "Login required" }, { status: 401 });
      await deleteStoredNorthernRoom(code, actorId);
      return Response.json({ ok: true });
    }
    if (ownerId) {
      if (!fallbackHostId || !(await loadStoredPlayerSession(fallbackHostId))) return Response.json({ error: "Login required" }, { status: 401 });
      return Response.json({ ok: true, deleted: await deleteHostedNorthernRooms(ownerId, fallbackHostId) });
    }
    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
