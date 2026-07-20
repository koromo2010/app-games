import { handle } from "@upstash/realtime";
import { gameApiAccessDeniedResponse } from "@/lib/game-access";
import { loadStoredCodeInterceptRoom } from "@/lib/code-intercept-room-store";
import { getCodeInterceptRealtime } from "@/lib/code-intercept-realtime";
import {
  codeInterceptRealtimePilotEnabled,
  codeInterceptRoomCodeFromRealtimeChannel,
} from "@/lib/code-intercept-realtime-schema";
import { requireAuthenticatedPlayerId } from "@/lib/player-auth";
import { commonOnlineRoomErrorResponse } from "@/lib/online-room-route-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function errorResponse(error: unknown) {
  return commonOnlineRoomErrorResponse(error)
    ?? Response.json({ error: "Realtime connection is unavailable" }, { status: 503 });
}

export async function GET(request: Request) {
  if (!codeInterceptRealtimePilotEnabled()) {
    return Response.json({ error: "Realtime pilot is disabled" }, { status: 404 });
  }
  const accessDenied = await gameApiAccessDeniedResponse("code-intercept");
  if (accessDenied) return accessDenied;
  const realtime = getCodeInterceptRealtime();
  if (!realtime) return Response.json({ error: "Realtime storage is unavailable" }, { status: 503 });

  try {
    const response = await handle({
      realtime,
      middleware: async ({ request: realtimeRequest, channels }) => {
        const requestUrl = new URL(realtimeRequest.url);
        const origin = realtimeRequest.headers.get("origin");
        if (origin && origin !== requestUrl.origin) return Response.json({ error: "Cross-origin realtime access is not allowed" }, { status: 403 });
        if (channels.length !== 1) return Response.json({ error: "Exactly one room channel is required" }, { status: 400 });
        const code = codeInterceptRoomCodeFromRealtimeChannel(channels[0] ?? "");
        if (!code) return Response.json({ error: "Invalid room channel" }, { status: 400 });
        const playerId = await requireAuthenticatedPlayerId();
        const room = await loadStoredCodeInterceptRoom(code);
        if (!room || !room.players.some((player) => player.id === playerId)) {
          return Response.json({ error: "Room access is not allowed" }, { status: 403 });
        }
      },
    })(request);
    return response ?? Response.json({ error: "Realtime connection failed" }, { status: 503 });
  } catch (error) {
    return errorResponse(error);
  }
}
