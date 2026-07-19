import { requirePlayerDebugAccess } from "@/lib/debug-access";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";
import { requireAuthenticatedPlayer } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { loadStoredCodeInterceptRoom } from "@/lib/code-intercept-room-store";
import {
  codeInterceptDebugWordSampleSize,
  codeInterceptWordSelectionBounds,
  loadCodeInterceptWordPool,
} from "@/lib/code-intercept-word-repository";

export async function GET(request: Request) {
  const accessDenied = await gameApiAccessDeniedResponse("code-intercept");
  if (accessDenied) return accessDenied;

  try {
    const player = await requireAuthenticatedPlayer();
    const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: player.id });
    if (limited) return limited;

    const roomCode = new URL(request.url).searchParams.get("roomCode")?.trim().toUpperCase() ?? "";
    const room = roomCode ? await loadStoredCodeInterceptRoom(roomCode) : null;
    if (!room) return Response.json({ error: "Room not found" }, { status: 404 });
    if (room.phase !== "lobby" || !room.debugMode || room.hostId !== player.id) {
      return Response.json({ error: "Debug word sampling is available to the host in a debug lobby" }, { status: 403 });
    }

    await requirePlayerDebugAccess(player.id);
    const words = await loadCodeInterceptWordPool(codeInterceptDebugWordSampleSize);
    if (words.length !== codeInterceptDebugWordSampleSize) {
      return Response.json({ error: "Not enough eligible words are available" }, { status: 503 });
    }

    return Response.json({
      words,
      bounds: codeInterceptWordSelectionBounds,
    });
  } catch (error) {
    const common = commonOnlineRoomErrorResponse(error);
    if (common) return common;
    return Response.json({ error: "Failed to sample Code Intercept words" }, { status: 500 });
  }
}
