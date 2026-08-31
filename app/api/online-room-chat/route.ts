import { getAuthenticatedPlayerId } from "@/lib/player-auth";
import { rateLimitPolicies, rateLimitResponseFor } from "@/lib/rate-limit";
import { parseRoomChatSendInput, parseRoomChatTarget } from "@/lib/room-chat-contract";
import { createRoomChatService } from "@/lib/room-chat-service";
import { resolveRoomChatAccess } from "@/lib/room-chat-access";
import { publishRoomChatHint } from "@/lib/online-room-realtime-server";

export const runtime = "nodejs";
const service = createRoomChatService({ resolveAccess: resolveRoomChatAccess });
const response = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const actorId = await getAuthenticatedPlayerId().catch(() => null);
  if (!actorId) return response("PLAYER_AUTH_REQUIRED", 401);
  const url = new URL(request.url);
  const target = parseRoomChatTarget({
    game: url.searchParams.get("game"), code: url.searchParams.get("code"), roomInstanceId: url.searchParams.get("roomInstanceId"),
  });
  if (!target) return response("ROOM_CHAT_INVALID_REQUEST", 400);
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomChatRead, { playerId: actorId, roomId: target.roomInstanceId });
  if (limited) return limited;
  try {
    const result = await service.page(actorId, { ...target, cursor: url.searchParams.get("after") || undefined });
    if ("error" in result) return response(String(result.error), result.error === "ROOM_CHAT_CURSOR_EXPIRED" ? 409 : 403);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return response("ROOM_CHAT_TEMPORARILY_UNAVAILABLE", 503);
  }
}

export async function POST(request: Request) {
  const actorId = await getAuthenticatedPlayerId().catch(() => null);
  if (!actorId) return response("PLAYER_AUTH_REQUIRED", 401);
  const input = parseRoomChatSendInput(await request.json().catch(() => null));
  if (!input) return response("ROOM_CHAT_INVALID_REQUEST", 400);
  const limited = await rateLimitResponseFor(request, rateLimitPolicies.roomChatSend, { playerId: actorId, roomId: input.roomInstanceId });
  if (limited) return limited;
  try {
    const result = await service.send(actorId, input);
    if ("error" in result) return response(String(result.error), 403);
    if (result.message.inserted) await publishRoomChatHint(input.game, input.code, input.roomInstanceId, result.message.orderCursor).catch(() => undefined);
    return Response.json({ message: result.message }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return response("ROOM_CHAT_TEMPORARILY_UNAVAILABLE", 503);
  }
}
