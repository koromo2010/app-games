import { appendCanvasLobbyStroke, clearCanvasLobbyAuthorStrokes, loadCanvasLobbyBoard, undoCanvasLobbyStroke } from "@/lib/canvas-lobby-board-store";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer, requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import type { DrawingStroke } from "@/lib/drawing-canvas";
import { conditionalJsonResponse } from "@/lib/conditional-json";

function fail(error: unknown) {
  if (error instanceof Error && error.message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
  if (isPlayerAuthConfigurationError(error) || (error instanceof Error && error.message === "REDIS_STORE_NOT_CONFIGURED")) return Response.json({ error: "Board storage unavailable" }, { status: 503 });
  return Response.json({ error: "Board update failed" }, { status: 500 });
}
export async function GET(request: Request) { const denied = await gameApiAccessDeniedResponse("canvas"); if (denied) return denied; try { await requireAuthenticatedPlayerId(); return conditionalJsonResponse(request, { board: await loadCanvasLobbyBoard() }); } catch (error) { return fail(error); } }
export async function PATCH(request: Request) { const denied = await gameApiAccessDeniedResponse("canvas"); if (denied) return denied; try { const session = await requireAuthenticatedPlayer(); const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id }); if (limited) return limited; const body = await request.json() as { action?: "stroke" | "undo" | "clear-own"; stroke?: DrawingStroke }; const board = body.action === "undo" ? await undoCanvasLobbyStroke(session.id) : body.action === "clear-own" ? await clearCanvasLobbyAuthorStrokes(session.id) : body.action === "stroke" && body.stroke ? await appendCanvasLobbyStroke(session.id, body.stroke) : null; return board ? Response.json({ board }) : Response.json({ error: "Invalid request" }, { status: 400 }); } catch (error) { return fail(error); } }
