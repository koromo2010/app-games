import {
  experimental_upgradeWebSocket,
  type WebSocketData,
} from "@vercel/functions";
import {
  onlineRoomRealtimeEnabled,
  onlineRoomRealtimeSocketConfigured,
  configureOnlineRoomRealtimeAuthorization,
  registerOnlineRoomSocket,
  subscribeOnlineRoomSocket,
  unregisterOnlineRoomSocket,
} from "@/lib/online-room-realtime-server";
import { normalizeOnlineRoomRealtimeCode, normalizeOnlineRoomRealtimeGame, parseOnlineRoomSubscription } from "@/lib/online-room-realtime-protocol";
import { createOnlineRoomRealtimeAuthorizer } from "@/lib/online-room-realtime-authorization";
import { productionOnlineRoomRealtimeAuthorizationDriver } from "@/lib/online-room-realtime-provider";
import { getAuthenticatedPlayerId } from "@/lib/player-auth";

export const runtime = "nodejs";

export function HEAD() {
  if (!onlineRoomRealtimeEnabled() || !onlineRoomRealtimeSocketConfigured()) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

const authorizer = createOnlineRoomRealtimeAuthorizer(productionOnlineRoomRealtimeAuthorizationDriver);
configureOnlineRoomRealtimeAuthorization(authorizer.authorize);
const concealed = () => Response.json({ error: "REALTIME_TARGET_UNAVAILABLE" }, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!onlineRoomRealtimeEnabled() || !onlineRoomRealtimeSocketConfigured()) return concealed();
  const actorId = await getAuthenticatedPlayerId().catch(() => null);
  if (!actorId) return concealed();
  const body = await request.json().catch(() => null) as { game?: unknown; code?: unknown; role?: unknown } | null;
  const game = normalizeOnlineRoomRealtimeGame(body?.game);
  const code = game ? normalizeOnlineRoomRealtimeCode(game, body?.code) : "";
  const role = body?.role === "spectator" ? "spectator" : body?.role === undefined || body?.role === "participant" ? "participant" : null;
  if (!game || !code || !role) return concealed();
  const capability = await authorizer.mint({ actorId, game, code, role }).catch(() => null);
  return capability
    ? Response.json({ capability, family: "room-revision" }, { headers: { "Cache-Control": "no-store" } })
    : concealed();
}

export async function GET() {
  if (!onlineRoomRealtimeEnabled() || !onlineRoomRealtimeSocketConfigured()) {
    return Response.json({ error: "Realtime room updates are not enabled" }, { status: 404 });
  }
  const actorId = await getAuthenticatedPlayerId().catch(() => null);
  if (!actorId) return concealed();
  return experimental_upgradeWebSocket((ws) => {
    registerOnlineRoomSocket(ws, actorId);
    ws.on("message", (data: WebSocketData) => {
      const raw = data.toString();
      if (raw.length > 512) return;
      try {
        const subscription = parseOnlineRoomSubscription(JSON.parse(raw));
        if (subscription) void subscribeOnlineRoomSocket(ws, subscription);
      } catch {
        // Invalid frames do not affect the room or connection.
      }
    });
    const close = () => unregisterOnlineRoomSocket(ws);
    ws.on("close", close);
    ws.on("error", close);
  }, { maxPayload: 512 });
}
