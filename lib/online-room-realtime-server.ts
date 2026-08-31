import { createClient } from "redis";
import type { WebSocket } from "ws";
import {
  onlineRoomRealtimeChannel,
  parseOnlineRoomRevisionEvent,
  type OnlineRoomRealtimeGame,
  type OnlineRoomRevisionEvent,
  type OnlineRoomSubscription,
} from "./online-room-realtime-protocol.ts";
import type { OnlineRoomRealtimeCapability } from "./online-room-realtime-capability.ts";
import { onOnlineRoomRealtimeRevocation } from "./online-room-realtime-revocation.ts";
import {
  emitObservabilityEvent,
  observabilityErrorCode,
} from "./observability/index.ts";
import {
  namespaceRedisCommand,
  redisCommand,
  resolveSocketRedisConfig,
} from "./redis-store.ts";
import { expectedAppEnvironment } from "./storage-environment-guard.ts";

const eventStreamKey = "online-room:events:v1";
const eventStreamMaxLength = 2_000;
const streamBlockMs = 5_000;
const heartbeatMs = 25_000;

export type OnlineRoomRealtimeSocketState = {
  actorId: string;
  capability: OnlineRoomRealtimeCapability | null;
  capabilityToken: string | null;
};
type StreamEntry = [string, string[]];
type StreamResult = Array<[string, StreamEntry[]]> | null;

const hub = {
  sockets: new Map<WebSocket, OnlineRoomRealtimeSocketState>(),
  streaming: false,
  streamClient: null as ReturnType<typeof createClient> | null,
  heartbeat: null as ReturnType<typeof setInterval> | null,
  lastEventId: "0-0",
};

let authorizeCapability: (token: string) => Promise<OnlineRoomRealtimeCapability | null> = async () => null;

export function configureOnlineRoomRealtimeAuthorization(
  authorize: (token: string) => Promise<OnlineRoomRealtimeCapability | null>,
) {
  authorizeCapability = authorize;
}

export function onlineRoomRealtimeEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.ONLINE_ROOM_WEBSOCKET_ENABLED === "0") return false;
  if (env.ONLINE_ROOM_WEBSOCKET_ENABLED === "1") return true;
  return expectedAppEnvironment(env.VERCEL_ENV, env.NODE_ENV, env.VERCEL_GIT_COMMIT_REF) === "development";
}

export function onlineRoomRealtimeSocketConfigured() {
  try {
    return Boolean(resolveSocketRedisConfig());
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

export async function deliverOnlineRoomRevision(
  event: OnlineRoomRevisionEvent,
  sockets: Map<WebSocket, OnlineRoomRealtimeSocketState> = hub.sockets,
  authorize: (token: string) => Promise<OnlineRoomRealtimeCapability | null> = authorizeCapability,
) {
  const channel = onlineRoomRealtimeChannel(event.game, event.code);
  if (!channel.endsWith(":")) {
    for (const [ws, state] of sockets) {
      const previous = state.capability;
      if (!previous || onlineRoomRealtimeChannel(previous.game, previous.code) !== channel) continue;
      const current = state.capabilityToken ? await authorize(state.capabilityToken) : null;
      if (!current || current.actorId !== state.actorId) {
        state.capability = null;
        state.capabilityToken = null;
        ws.close(1008, "authorization-revoked");
        continue;
      }
      send(ws, event);
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

function stringifyRedisCommand(command: unknown[]) {
  return command.map((part) => typeof part === "string" ? part : String(part));
}

export function onlineRoomRealtimeReaderCommands(keyPrefix: string, lastEventId = "0-0") {
  return {
    tail: stringifyRedisCommand(namespaceRedisCommand(
      ["XREVRANGE", eventStreamKey, "+", "-", "COUNT", "1"],
      keyPrefix,
    )),
    read: stringifyRedisCommand(namespaceRedisCommand(
      ["XREAD", "BLOCK", String(streamBlockMs), "COUNT", "100", "STREAMS", eventStreamKey, lastEventId],
      keyPrefix,
    )),
  };
}

async function closeStreamClient(client: ReturnType<typeof createClient>) {
  if (!client.isOpen) return;
  await client.close().catch(() => undefined);
}

async function runStream(url: string, keyPrefix: string) {
  const client = createClient({
    url,
    socket: { reconnectStrategy: (retries) => Math.min(5_000, Math.max(200, retries * 200)) },
  });
  hub.streamClient = client;
  try {
    await client.connect();
    const tail = await client.sendCommand<string[][]>(onlineRoomRealtimeReaderCommands(keyPrefix).tail);
    hub.lastEventId = tail?.[0]?.[0] ?? "0-0";
    while (hub.streaming && hub.sockets.size > 0) {
      const result = await client.sendCommand<StreamResult>(
        onlineRoomRealtimeReaderCommands(keyPrefix, hub.lastEventId).read,
      );
      for (const [, entries] of result ?? []) {
        for (const [id, flat] of entries) {
          hub.lastEventId = id;
          const event = parseStoredEvent(fields(flat).d);
          if (event) await deliverOnlineRoomRevision(event);
        }
      }
    }
  } catch (error) {
    if (hub.streaming && hub.sockets.size > 0) {
      emitObservabilityEvent("error", "online-room-realtime.stream", {
        operation: "redis-stream",
        outcome: "failed",
        errorCode: observabilityErrorCode(error),
      });
    }
  } finally {
    await closeStreamClient(client);
    if (hub.streamClient === client) hub.streamClient = null;
    hub.streaming = false;
    if (hub.sockets.size > 0) setTimeout(startStream, 1_000);
  }
}

function startStream() {
  if (hub.streaming || hub.sockets.size === 0 || !onlineRoomRealtimeEnabled()) return;
  let socketConfig: ReturnType<typeof resolveSocketRedisConfig>;
  try {
    socketConfig = resolveSocketRedisConfig();
  } catch {
    return;
  }
  if (!socketConfig) return;
  hub.streaming = true;
  void runStream(socketConfig.url, socketConfig.keyPrefix);
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

export function registerOnlineRoomSocket(ws: WebSocket, actorId: string) {
  hub.sockets.set(ws, { actorId, capability: null, capabilityToken: null });
  startHeartbeat();
  startStream();
}

export async function subscribeOnlineRoomSocket(ws: WebSocket, subscription: OnlineRoomSubscription) {
  const state = hub.sockets.get(ws);
  if (!state) return false;
  const capability = await authorizeCapability(subscription.capability);
  if (!capability || capability.actorId !== state.actorId) {
    state.capability = null;
    state.capabilityToken = null;
    ws.close(1008, "authorization-denied");
    return false;
  }
  state.capability = capability;
  state.capabilityToken = subscription.capability;
  send(ws, { type: "subscribed" });
  return true;
}

export function unregisterOnlineRoomSocket(ws: WebSocket) {
  hub.sockets.delete(ws);
  stopHeartbeat();
}

onOnlineRoomRealtimeRevocation((signal) => {
  for (const [ws, state] of hub.sockets) {
    if (state.actorId === signal.actorId) {
      state.capability = null;
      state.capabilityToken = null;
      ws.close(1008, "authorization-revoked");
    }
  }
});

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
