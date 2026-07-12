import {
  applyStoredTahoiyaRoomAction,
  deleteStoredHostedTahoiyaRooms,
  deleteStoredTahoiyaRoom,
  listStoredJoinableTahoiyaRooms,
  loadAndReconcileStoredTahoiyaRoom,
  loadStoredTahoiyaPlayerActiveRoom,
  saveStoredTahoiyaRoom,
} from "@/lib/tahoiya-room-store";
import type { TahoiyaRoomAction } from "@/lib/tahoiya-types";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const playerId = url.searchParams.get("playerId");

  try {
    if (code) {
      const room = await loadAndReconcileStoredTahoiyaRoom(code);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      return Response.json({ room });
    }

    if (playerId) {
      const room = await loadStoredTahoiyaPlayerActiveRoom(playerId);
      return Response.json({ room });
    }

    const rooms = await listStoredJoinableTahoiyaRooms();
    return Response.json({ rooms });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }

    return Response.json({ error: "Failed to load rooms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { room?: unknown; actorId?: unknown };
    const actorId = typeof body.actorId === "string" ? body.actorId : "";
    if (!actorId) return Response.json({ error: "actorId is required" }, { status: 400 });
    const room = await saveStoredTahoiyaRoom(body.room, actorId);
    return Response.json({ room });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }

    if (error instanceof Error && error.message === "INVALID_TAHOIYA_ROOM") {
      return Response.json({ error: "Invalid room" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_FORBIDDEN") {
      return Response.json({ error: "Room update is not allowed" }, { status: 403 });
    }

    return Response.json({ error: "Failed to save room" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { code?: unknown; action?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!code || !body.action || typeof body.action !== "object") {
      return Response.json({ error: "code and action are required" }, { status: 400 });
    }
    const room = await applyStoredTahoiyaRoomAction(code, body.action as TahoiyaRoomAction);
    return Response.json({ room });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_NOT_FOUND") {
      return Response.json({ error: "Room not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_FORBIDDEN") {
      return Response.json({ error: "Room action is not allowed" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_CONFLICT") {
      return Response.json({ error: "Room update conflicted; retry the action" }, { status: 409 });
    }
    return Response.json({ error: "Failed to update room" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const ownerId = url.searchParams.get("ownerId");
  const fallbackHostId = url.searchParams.get("fallbackHostId") ?? "";
  const actorId = url.searchParams.get("actorId") ?? "";

  try {
    if (code) {
      if (!actorId) return Response.json({ error: "actorId is required" }, { status: 400 });
      await deleteStoredTahoiyaRoom(code, actorId);
      return Response.json({ ok: true });
    }

    if (ownerId) {
      const deleted = await deleteStoredHostedTahoiyaRooms(ownerId, fallbackHostId);
      return Response.json({ ok: true, deleted });
    }

    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }
    if (error instanceof Error && error.message === "TAHOIYA_ROOM_FORBIDDEN") {
      return Response.json({ error: "Room delete is not allowed" }, { status: 403 });
    }

    return Response.json({ error: "Failed to delete room" }, { status: 500 });
  }
}
