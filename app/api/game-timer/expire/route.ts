import { getGameTimerRetryAfterMs } from "@/lib/game-timer/policy";
import { createGameTimerEventId } from "@/lib/game-timer/event";
import { applyWordWolfTimeout, wordWolfTimerPolicy } from "@/lib/wordwolf-command-domain";
import { loadStoredWordWolfRoom, saveStoredWordWolfRoom } from "@/lib/wordwolf-room-store";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { game?: string; roomCode?: string; eventId?: string };
    if (body.game !== "wordwolf" || !body.roomCode || !body.eventId) return Response.json({ error: "Unsupported timer event" }, { status: 400 });
    const room = await loadStoredWordWolfRoom(body.roomCode);
    if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
    const expectedEventId = createGameTimerEventId({ game: "wordwolf", roomCode: room.code, phase: room.phase, revision: room.revision, startedAt: room.currentTurnStartedAt });
    if (body.eventId !== expectedEventId) return Response.json({ room, applied: false, retryAfterMs: 0 });
    const next = applyWordWolfTimeout(room);
    if (!next) return Response.json({ room, applied: false, retryAfterMs: getGameTimerRetryAfterMs(wordWolfTimerPolicy(room)) });
    try {
      const saved = await saveStoredWordWolfRoom({ ...next, revision: room.revision + 1, updatedAt: Date.now() });
      return Response.json({ room: saved, applied: true, retryAfterMs: 0 });
    } catch (error) {
      if (error instanceof Error && error.message === "WORDWOLF_ROOM_CONFLICT") return Response.json({ room: await loadStoredWordWolfRoom(body.roomCode), applied: false, retryAfterMs: 0 });
      throw error;
    }
  } catch {
    return Response.json({ error: "Failed to apply timer event" }, { status: 500 });
  }
}
