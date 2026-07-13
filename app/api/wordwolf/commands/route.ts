import { loadStoredWordWolfRoom, saveStoredWordWolfRoom } from "@/lib/wordwolf-room-store";
import { applyWordWolfClueCommand, applyWordWolfTimeout, applyWordWolfVoteCommand, wordWolfDeadlineAt, wordWolfTimeoutGraceMs } from "@/lib/wordwolf-command-domain";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: string; type?: string; commandId?: string; playerId?: string; text?: string; targetId?: string };
    if (!body.code || !body.commandId || body.commandId.length > 160) return Response.json({ error: "Invalid command" }, { status: 400 });
    const room = await loadStoredWordWolfRoom(body.code);
    if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
    const deadline = wordWolfDeadlineAt(room);
    if (body.type !== "expire-phase" && deadline && Date.now() > deadline + wordWolfTimeoutGraceMs()) {
      return Response.json({ error: "Command arrived after the grace period", room }, { status: 409 });
    }
    const next = body.type === "expire-phase"
      ? applyWordWolfTimeout(room)
      : body.type === "submit-clue" && body.playerId && typeof body.text === "string"
        ? applyWordWolfClueCommand(room, body.playerId, body.text)
        : body.type === "cast-vote" && body.playerId && body.targetId
          ? applyWordWolfVoteCommand(room, body.playerId, body.targetId)
          : null;
    if (!next) {
      if (body.type !== "expire-phase") return Response.json({ error: "Command is not valid for the current room state", room }, { status: 409 });
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
