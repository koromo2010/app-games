import { cookies } from "next/headers";
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
import { privateGameCookieMatches, privateGameCookieName } from "@/lib/private-game-access";
import { loadStoredPlayerSession } from "@/lib/player-store";

async function hasPrivateAccess() {
  const store = await cookies();
  return privateGameCookieMatches(store.get(privateGameCookieName)?.value);
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "REDIS_STORE_NOT_CONFIGURED") return Response.json({ error: "Room storage is not configured" }, { status: 503 });
  if (message === "KOTOBA_SENPUKU_ROOM_NOT_FOUND") return Response.json({ error: "Room not found" }, { status: 404 });
  if (message === "KOTOBA_SENPUKU_BAD_PASSPHRASE") return Response.json({ error: "Bad passphrase" }, { status: 401 });
  if (message === "KOTOBA_SENPUKU_ROOM_FULL") return Response.json({ error: "Room is full" }, { status: 409 });
  if (message === "KOTOBA_SENPUKU_NOT_ENOUGH_PLAYERS") return Response.json({ error: "Not enough players" }, { status: 409 });
  if (message === "KOTOBA_SENPUKU_NOT_YOUR_TURN" || message === "KOTOBA_SENPUKU_ROOM_FORBIDDEN") return Response.json({ error: "Room action is not allowed" }, { status: 403 });
  if (message === "KOTOBA_SENPUKU_INVALID_WORD") return Response.json({ error: "Invalid secret word" }, { status: 400 });
  if (message === "KOTOBA_SENPUKU_INVALID_KANA" || message === "KOTOBA_SENPUKU_INVALID_TARGET") return Response.json({ error: "Invalid battle action" }, { status: 400 });
  if (message === "KOTOBA_SENPUKU_ROOM_CONFLICT") return Response.json({ error: "Room update conflicted; retry" }, { status: 409 });
  if (message === "INVALID_KOTOBA_SENPUKU_ROOM") return Response.json({ error: "Invalid room" }, { status: 400 });
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
      const room = await loadAndReconcileKotobaSenpukuRoom(code);
      if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
      if (!room.players.some((player) => player.id === playerId)) return Response.json({ error: "Room access is not allowed" }, { status: 403 });
      return Response.json({ room: sanitizeKotobaSenpukuRoom(room, playerId) });
    }
    if (playerId) {
      if (!(await loadStoredPlayerSession(playerId))) return Response.json({ error: "Login required" }, { status: 401 });
      const room = await loadKotobaSenpukuPlayerActiveRoom(playerId);
      return Response.json({ room: room ? sanitizeKotobaSenpukuRoom(room, playerId) : null });
    }
    return Response.json({ rooms: await listJoinableKotobaSenpukuRooms() });
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
    const room = await createStoredKotobaSenpukuRoom(body.room, actorId);
    return Response.json({ room: sanitizeKotobaSenpukuRoom(room, actorId) });
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
    const actorId = typeof (body.action as { actorId?: unknown }).actorId === "string" ? (body.action as { actorId: string }).actorId : "";
    if (!actorId) return Response.json({ error: "actorId is required" }, { status: 400 });
    let action = { ...body.action, actorId } as KotobaSenpukuRoomAction;
    const session = await loadStoredPlayerSession(actorId);
    if (!session?.id) return Response.json({ error: "Login required" }, { status: 401 });
    if (action.type === "join-room") {
      action = { ...action, player: { id: session.id, name: session.name, joinedAt: Date.now(), avatarColor: session.avatarColor, avatarImage: session.avatarImage ?? undefined } };
    }
    const room = await applyStoredKotobaSenpukuAction(code, action);
    return Response.json({ room: sanitizeKotobaSenpukuRoom(room, actorId) });
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
      if (!actorId || !(await loadStoredPlayerSession(actorId))) return Response.json({ error: "Login required" }, { status: 401 });
      await deleteStoredKotobaSenpukuRoom(code, actorId);
      return Response.json({ ok: true });
    }
    if (ownerId) {
      if (!fallbackHostId || !(await loadStoredPlayerSession(fallbackHostId))) return Response.json({ error: "Login required" }, { status: 401 });
      return Response.json({ ok: true, deleted: await deleteHostedKotobaSenpukuRooms(ownerId, fallbackHostId) });
    }
    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
