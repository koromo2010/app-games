import { loadStoredWordWolfRoom, saveStoredWordWolfRoom } from "@/lib/wordwolf-room-store";
import { applyWordWolfTimeout, wordWolfDeadlineAt, wordWolfTimeoutGraceMs } from "@/lib/wordwolf-timeout-command";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: string; type?: string; commandId?: string };
    if (!body.code || body.type !== "expire-phase" || !body.commandId) return Response.json({ error: "Invalid command" }, { status: 400 });
    const room = await loadStoredWordWolfRoom(body.code);
    if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
    const next = applyWordWolfTimeout(room);
    if (!next) {
      const deadline = wordWolfDeadlineAt(room);
      const retryAfterMs = deadline ? Math.max(0, deadline + wordWolfTimeoutGraceMs() - Date.now()) : 0;
      return Response.json({ room, applied: false, retryAfterMs });
    }
    try {
      const saved = await saveStoredWordWolfRoom({ ...next, revision: room.revision + 1, updatedAt: Date.now() });
      return Response.json({ room: saved, applied: true });
    } catch (error) {
      if (error instanceof Error && error.message === "WORDWOLF_ROOM_CONFLICT") {
        return Response.json({ room: await loadStoredWordWolfRoom(body.code), applied: false });
      }
      throw error;
    }
  } catch {
    return Response.json({ error: "Failed to apply command" }, { status: 500 });
  }
}
