import { builtInCommonOnlineRoomGameIds } from "./game-locale-registry.ts";

export const onlineRoomRealtimeGames = builtInCommonOnlineRoomGameIds;

export type BuiltInOnlineRoomRealtimeGame = typeof onlineRoomRealtimeGames[number];
export type CanvasOnlineRoomRealtimeGame = "canvas";
export type GameSdkOnlineRoomRealtimeGame = `sdk:${string}`;
export type OnlineRoomRealtimeGame =
  | BuiltInOnlineRoomRealtimeGame
  | CanvasOnlineRoomRealtimeGame
  | GameSdkOnlineRoomRealtimeGame;

export type OnlineRoomSubscription = {
  type: "subscribe";
  capability: string;
  families: [OnlineRoomNotificationFamily];
};

export const onlineRoomNotificationFamilies = ["room-revision", "chat-hint"] as const;
export type OnlineRoomNotificationFamily = typeof onlineRoomNotificationFamilies[number];

export type OnlineRoomRevisionEvent = {
  type: "room-updated";
  game: OnlineRoomRealtimeGame;
  code: string;
  revision: number;
  timestamp: number;
};

export type OnlineRoomChatHintEvent = {
  type: "room-chat-updated";
  game: OnlineRoomRealtimeGame;
  code: string;
  roomInstanceId: string;
  latestCursor: string;
  timestamp: number;
};

export type OnlineRoomRealtimeEvent = OnlineRoomRevisionEvent | OnlineRoomChatHintEvent;

export const onlineRoomRealtimeTimings = {
  reconciliation: 45_000,
  subscriptionTimeout: 5_000,
  initialReconnect: 1_000,
  maximumReconnect: 30_000,
} as const;

export function nextOnlineRoomRealtimeReconnectDelay(currentDelay: number) {
  return Math.min(onlineRoomRealtimeTimings.maximumReconnect, currentDelay * 2);
}

const gameSet = new Set<string>(onlineRoomRealtimeGames);
const gameSdkRealtimeGamePattern = /^sdk:[a-z][a-z0-9-]{0,63}$/;

export function normalizeOnlineRoomRealtimeGame(value: unknown): OnlineRoomRealtimeGame | null {
  if (typeof value !== "string") return null;
  if (gameSet.has(value)) return value as BuiltInOnlineRoomRealtimeGame;
  if (value === "canvas") return value;
  return gameSdkRealtimeGamePattern.test(value)
    ? value as GameSdkOnlineRoomRealtimeGame
    : null;
}

export function normalizeOnlineRoomCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{4}$/.test(code) ? code : "";
}

export function normalizeOnlineRoomRealtimeCode(
  game: OnlineRoomRealtimeGame,
  value: unknown,
) {
  const code = typeof value === "string" ? value.normalize("NFKC").trim().toUpperCase() : "";
  return game.startsWith("sdk:")
    ? (/^[A-Z0-9]{4,12}$/.test(code) ? code : "")
    : normalizeOnlineRoomCode(code);
}

export function parseOnlineRoomSubscription(value: unknown): OnlineRoomSubscription | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  return input.type === "subscribe"
    && typeof input.capability === "string"
    && /^[A-Za-z0-9_-]{80,420}\.[A-Za-z0-9_-]{43}$/.test(input.capability)
    && Array.isArray(input.families)
    && input.families.length === 1
    && onlineRoomNotificationFamilies.includes(input.families[0] as OnlineRoomNotificationFamily)
    ? { type: "subscribe", capability: input.capability, families: [input.families[0] as OnlineRoomNotificationFamily] }
    : null;
}

export function parseOnlineRoomChatHintEvent(value: unknown): OnlineRoomChatHintEvent | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const game = normalizeOnlineRoomRealtimeGame(input.game);
  const code = game ? normalizeOnlineRoomRealtimeCode(game, input.code) : "";
  return input.type === "room-chat-updated" && game && code
    && typeof input.roomInstanceId === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(input.roomInstanceId)
    && typeof input.latestCursor === "string" && input.latestCursor.length <= 320
    && typeof input.timestamp === "number" && Number.isFinite(input.timestamp)
    ? { type: "room-chat-updated", game, code, roomInstanceId: input.roomInstanceId, latestCursor: input.latestCursor, timestamp: input.timestamp }
    : null;
}

export function parseOnlineRoomRealtimeEvent(value: unknown): OnlineRoomRealtimeEvent | null {
  return parseOnlineRoomRevisionEvent(value) ?? parseOnlineRoomChatHintEvent(value);
}

export function parseOnlineRoomRevisionEvent(value: unknown): OnlineRoomRevisionEvent | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const game = normalizeOnlineRoomRealtimeGame(input.game);
  const code = game ? normalizeOnlineRoomRealtimeCode(game, input.code) : "";
  const revision = typeof input.revision === "number" && Number.isSafeInteger(input.revision) && input.revision >= 0
    ? input.revision
    : null;
  const timestamp = typeof input.timestamp === "number" && Number.isFinite(input.timestamp)
    ? input.timestamp
    : null;
  return input.type === "room-updated" && game && code && revision !== null && timestamp !== null
    ? { type: "room-updated", game, code, revision, timestamp }
    : null;
}

export function onlineRoomRealtimeChannel(game: OnlineRoomRealtimeGame, code: string) {
  return `${game}:${normalizeOnlineRoomRealtimeCode(game, code)}`;
}
