import { createClient } from "redis";
import type { WebSocket } from "ws";
import {
  onlineRoomRealtimeChannel,
  parseOnlineRoomRevisionEvent,
  type OnlineRoomRealtimeGame,
  type OnlineRoomRevisionEvent,
  type OnlineRoomSubscription,
} from "./online-room-realtime-protocol.ts";
import { redisCommand, resolveSocketRedisUrl } from "./redis-store.ts";

const eventStreamKey = "online-room:events:v1";
const eventStreamMaxLength = 2_000;
const streamBlockMs = 5_000;
const heartbeatMs = 25_000;

type SocketState = { channels: Set<string> };
type StreamEntry = [string, string[]];
type StreamResult = Array<[string, StreamEntry[]]> | null;

const hub = {
  sockets: new Map<WebSocket, SocketState>(),
  streaming: false,
  streamClient: null as ReturnType<typeof createClient> | null,
  heartbeat: null as ReturnType<typeof setInterval> | null,
  lastEventId: "0-0",
};

export function onlineRoomRealtimeEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.ONLINE_ROOM_WEBSOCKET_ENABLED === "0") return false;
  if (env.ONLINE_ROOM_WEBSOCKET_ENABLED === "1") return true;
  return env.VERCEL_ENV === "preview" || env.NODE_ENV === "development";
}

export function onlineRoomRealtimeSocketConfigured() {
  try {
    return Boolean(resolveSocketRedisUrl());
  } catch {
    return false;
  }
}

function fields(flat: string[]) {
  const result: Record<string, string> = {};
  for (let index = 0; index + 1 < flat.length; index += 2) result[flat[index]] = flat[index + 1];
  return result;
}

function send(ws: WebSocket, event: OnlineRoomRevisionEvent | { type: "subscribed" }) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(event));
}

function broadcast(event: OnlineRoomRevisionEvent) {
  const channel = onlineRoomRealtimeChannel(event.game, event.code);
  if (!channel.endsWith(":")) {
    for (const [ws, state] of hub.sockets) {
      if (state.channels.has(channel)) send(ws, event);
    }
  }
}

function parseStoredEvent(raw: string | undefined) {
  if (!raw) return null;
  try {
    return parseOnlineRoomRevisionEvent(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function closeStreamClient(client: ReturnType<typeof createClient>) {
  if (!client.isOpen) return;
  await client.close().catch(() => undefined);
}

async function runStream(url: string) {
  const client = createClient({
    url,
    socket: { reconnectStrategy: (retries) => Math.min(5_000, Math.max(200, retries * 200)) },
  });
  hub.streamClient = client;
  try {
    await client.connect();
    const tail = await client.sendCommand<string[][]>(["XREVRANGE", eventStreamKey, "+", "-", "COUNT", "1"]);
    hub.lastEventId = tail?.[0]?.[0] ?? "0-0";
    while (hub.streaming && hub.sockets.size > 0) {
      const result = await client.sendCommand<StreamResult>([
        "XREAD", "BLOCK", String(streamBlockMs), "COUNT", "100", "STREAMS", eventStreamKey, hub.lastEventId,
      ]);
      for (const [, entries] of result ?? []) {
        for (const [id, flat] of entries) {
          hub.lastEventId = id;
          const event = parseStoredEvent(fields(flat).d);
          if (event) broadcast(event);
        }
      }
    }
  } catch (error) {
    if (hub.streaming && hub.sockets.size > 0) console.error("[online-room-realtime] stream failed", error);
  } finally {
    await closeStreamClient(client);
    if (hub.streamClient === client) hub.streamClient = null;
    hub.streaming = false;
    if (hub.sockets.size > 0) setTimeout(startStream, 1_000);
  }
}

function startStream() {
  if (hub.streaming || hub.sockets.size === 0 || !onlineRoomRealtimeEnabled()) return;
  let socketConfig: ReturnType<typeof resolveSocketRedisUrl>;
  try {
    socketConfig = resolveSocketRedisUrl();
  } catch {
    return;
  }
  if (!socketConfig) return;
  hub.streaming = true;
  void runStream(socketConfig.url);
}

function startHeartbeat() {
  if (hub.heartbeat) return;
  hub.heartbeat = setInterval(() => {
    for (const ws of hub.sockets.keys()) {
      if (ws.readyState === 1) ws.ping();
    }
  }, heartbeatMs);
}

function stopHeartbeat() {
  if (!hub.heartbeat || hub.sockets.size > 0) return;
  clearInterval(hub.heartbeat);
  hub.heartbeat = null;
}

export function registerOnlineRoomSocket(ws: WebSocket) {
  hub.sockets.set(ws, { channels: new Set() });
  startHeartbeat();
  startStream();
}

export function subscribeOnlineRoomSocket(ws: WebSocket, subscription: OnlineRoomSubscription) {
  const state = hub.sockets.get(ws);
  if (!state) return;
  state.channels.clear();
  state.channels.add(onlineRoomRealtimeChannel(subscription.game, subscription.code));
  send(ws, { type: "subscribed" });
}

export function unregisterOnlineRoomSocket(ws: WebSocket) {
  hub.sockets.delete(ws);
  stopHeartbeat();
}

export async function publishOnlineRoomRevision(game: OnlineRoomRealtimeGame, room: { code: string; revision: number }) {
  if (!onlineRoomRealtimeEnabled()) return false;
  const event: OnlineRoomRevisionEvent = {
    type: "room-updated",
    game,
    code: room.code.trim().toUpperCase(),
    revision: room.revision,
    timestamp: Date.now(),
  };
  await redisCommand<string>([
    "XADD", eventStreamKey, "MAXLEN", "~", String(eventStreamMaxLength), "*", "d", JSON.stringify(event),
  ]);
  return true;
}
