import {
  loadStoredRoomDefaults,
  saveStoredRoomDefaults,
} from "@/lib/room-defaults-store";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED";
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const defaults = await loadStoredRoomDefaults(
      url.searchParams.get("game"),
      url.searchParams.get("playerId"),
    );
    return Response.json({ defaults });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Room defaults storage is not configured" }, { status: 503 });
    }

    return Response.json({ error: "Failed to load room defaults" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      game?: unknown;
      playerId?: unknown;
      defaults?: unknown;
    };
    const defaults = await saveStoredRoomDefaults(body.game, body.playerId, body.defaults);
    return Response.json({ defaults });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Room defaults storage is not configured" }, { status: 503 });
    }

    if (error instanceof Error && error.message === "INVALID_ROOM_DEFAULTS") {
      return Response.json({ error: "Invalid room defaults" }, { status: 400 });
    }

    return Response.json({ error: "Failed to save room defaults" }, { status: 500 });
  }
}
