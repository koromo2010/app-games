import {
  experimental_upgradeWebSocket,
  type WebSocketData,
} from "@vercel/functions";
import {
  onlineRoomRealtimeEnabled,
  onlineRoomRealtimeSocketConfigured,
  registerOnlineRoomSocket,
  subscribeOnlineRoomSocket,
  unregisterOnlineRoomSocket,
} from "@/lib/online-room-realtime-server";
import { parseOnlineRoomSubscription } from "@/lib/online-room-realtime-protocol";

export const runtime = "nodejs";

export function GET() {
  if (!onlineRoomRealtimeEnabled() || !onlineRoomRealtimeSocketConfigured()) {
    return Response.json({ error: "Realtime room updates are not enabled" }, { status: 404 });
  }
  return experimental_upgradeWebSocket((ws) => {
    registerOnlineRoomSocket(ws);
    ws.on("message", (data: WebSocketData) => {
      const raw = data.toString();
      if (raw.length > 512) return;
      try {
        const subscription = parseOnlineRoomSubscription(JSON.parse(raw));
        if (subscription) subscribeOnlineRoomSocket(ws, subscription);
      } catch {
        // Invalid frames do not affect the room or connection.
      }
    });
    const close = () => unregisterOnlineRoomSocket(ws);
    ws.on("close", close);
    ws.on("error", close);
  }, { maxPayload: 512 });
}
