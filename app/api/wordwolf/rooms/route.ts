import {
  deleteStoredHostedWordWolfRooms,
  deleteStoredWordWolfRoom,
  listStoredJoinableWordWolfRooms,
  loadStoredWordWolfRoom,
  saveStoredWordWolfRoom,
} from "@/lib/wordwolf-room-store";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  try {
    if (code) {
      const room = await loadStoredWordWolfRoom(code);
      if (!room) {
        return Response.json({ error: "Room not found" }, { status: 404 });
      }

      return Response.json({ room });
    }

    const rooms = await listStoredJoinableWordWolfRooms();
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
    const body = (await request.json()) as { room?: unknown };
    const room = await saveStoredWordWolfRoom(body.room);
    return Response.json({ room });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }

    if (error instanceof Error && error.message === "INVALID_WORDWOLF_ROOM") {
      return Response.json({ error: "Invalid room" }, { status: 400 });
    }

    return Response.json({ error: "Failed to save room" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const ownerId = url.searchParams.get("ownerId");
  const fallbackHostId = url.searchParams.get("fallbackHostId") ?? "";

  try {
    if (code) {
      await deleteStoredWordWolfRoom(code);
      return Response.json({ ok: true });
    }

    if (ownerId) {
      const deleted = await deleteStoredHostedWordWolfRooms(ownerId, fallbackHostId);
      return Response.json({ ok: true, deleted });
    }

    return Response.json({ error: "code or ownerId is required" }, { status: 400 });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Room storage is not configured" }, { status: 503 });
    }

    return Response.json({ error: "Failed to delete room" }, { status: 500 });
  }
}
