import { loadStoredPlayerSession, saveStoredPlayerSession } from "@/lib/player-store";
import { normalizePlayerName } from "@/lib/player-session";

function isStoreNotConfigured(error: unknown) {
  return error instanceof Error && error.message === "PLAYER_STORE_NOT_CONFIGURED";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();

  if (!id) {
    return Response.json({ error: "Player id is required." }, { status: 400 });
  }

  try {
    const session = await loadStoredPlayerSession(id);
    if (!session) {
      return Response.json({ error: "Player not found." }, { status: 404 });
    }

    return Response.json({ session });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Player store is not configured." }, { status: 503 });
    }

    return Response.json({ error: "Failed to load player." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: {
    id?: unknown;
    name?: unknown;
    avatarColor?: unknown;
    avatarImage?: unknown;
    createdAt?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const session = await saveStoredPlayerSession({
      id: typeof body.id === "string" ? body.id : undefined,
      name: normalizePlayerName(typeof body.name === "string" ? body.name : ""),
      avatarColor: typeof body.avatarColor === "string" ? body.avatarColor : "",
      avatarImage: typeof body.avatarImage === "string" ? body.avatarImage : null,
      createdAt: typeof body.createdAt === "number" ? body.createdAt : undefined,
    });

    return Response.json({ session });
  } catch (error) {
    if (isStoreNotConfigured(error)) {
      return Response.json({ error: "Player store is not configured." }, { status: 503 });
    }

    return Response.json({ error: "Failed to save player." }, { status: 500 });
  }
}
