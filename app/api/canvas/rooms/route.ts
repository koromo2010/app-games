import { createCanvasRoom, deleteCanvasRoom, loadCanvasRoom, publicCanvasRoom, updateCanvasRoom } from "@/lib/canvas-room-store";
import type { CanvasLayerMode, CanvasRoomAction } from "@/lib/canvas-room";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { isPlayerAuthConfigurationError, requireAuthenticatedPlayer, requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { conditionalVersionedJsonResponse } from "@/lib/conditional-json";

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "PLAYER_AUTH_REQUIRED") return Response.json({ error: "Login required" }, { status: 401 });
  if (isPlayerAuthConfigurationError(error) || message === "REDIS_STORE_NOT_CONFIGURED") return Response.json({ error: "Room storage unavailable" }, { status: 503 });
  if (message === "CANVAS_ROOM_NOT_FOUND") return Response.json({ error: "Room not found" }, { status: 404 });
  if (message === "CANVAS_BAD_PASSPHRASE") return Response.json({ error: "Bad passphrase" }, { status: 401 });
  if (message === "CANVAS_ROOM_FULL" || message === "CANVAS_ROOM_CONFLICT") return Response.json({ error: "Room is busy" }, { status: 409 });
  if (message === "CANVAS_ROOM_FORBIDDEN") return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ error: "Room update failed" }, { status: 500 });
}
const player = (session: Awaited<ReturnType<typeof requireAuthenticatedPlayer>>) => ({ id: session.id, name: session.name, joinedAt: Date.now() });
export async function GET(request: Request) { const denied = await gameApiAccessDeniedResponse("canvas"); if (denied) return denied; try { const authenticatedPlayerId = await requireAuthenticatedPlayerId(); const room = await loadCanvasRoom(new URL(request.url).searchParams.get("code") || ""); if (!room) throw new Error("CANVAS_ROOM_NOT_FOUND"); if (!room.players.some((item) => item.id === authenticatedPlayerId)) throw new Error("CANVAS_ROOM_FORBIDDEN"); return conditionalVersionedJsonResponse(request, `canvas:${room.code}:${room.revision}:${authenticatedPlayerId}`, () => ({ room: publicCanvasRoom(room) })); } catch (error) { return fail(error); } }
export async function POST(request: Request) { const denied = await gameApiAccessDeniedResponse("canvas"); if (denied) return denied; try { const session = await requireAuthenticatedPlayer(); const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id }); if (limited) return limited; const body = await request.json() as { passphrase?: string; layerMode?: CanvasLayerMode }; return Response.json({ room: publicCanvasRoom(await createCanvasRoom(player(session), body.passphrase, body.layerMode === "per-player" ? "per-player" : "shared")) }); } catch (error) { return fail(error); } }
export async function PATCH(request: Request) { const denied = await gameApiAccessDeniedResponse("canvas"); if (denied) return denied; try { const session = await requireAuthenticatedPlayer(); const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id }); if (limited) return limited; const body = await request.json() as { code?: string; action?: CanvasRoomAction }; if (!body.code || !body.action) return Response.json({ error: "Invalid request" }, { status: 400 }); return Response.json({ room: publicCanvasRoom(await updateCanvasRoom(body.code, player(session), body.action)) }); } catch (error) { return fail(error); } }
export async function DELETE(request: Request) { const denied = await gameApiAccessDeniedResponse("canvas"); if (denied) return denied; try { const session = await requireAuthenticatedPlayer(); const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomMutation, { playerId: session.id }); if (limited) return limited; await deleteCanvasRoom(new URL(request.url).searchParams.get("code") || "", session.id); return Response.json({ ok: true }); } catch (error) { return fail(error); } }
