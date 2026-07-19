export const onlineRoomRealtimeGames = [
  "code-intercept",
  "hodoai",
  "kotoba-senpuku",
  "nigoichi",
  "northern-branch",
  "tahoiya",
  "wordwolf",
] as const;

export type OnlineRoomRealtimeGame = typeof onlineRoomRealtimeGames[number];

export type OnlineRoomSubscription = {
  type: "subscribe";
  game: OnlineRoomRealtimeGame;
  code: string;
};

export type OnlineRoomRevisionEvent = {
  type: "room-updated";
  game: OnlineRoomRealtimeGame;
  code: string;
  revision: number;
  timestamp: number;
};

const gameSet = new Set<string>(onlineRoomRealtimeGames);

export function normalizeOnlineRoomCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-Z0-9]{4}$/.test(code) ? code : "";
}

export function parseOnlineRoomSubscription(value: unknown): OnlineRoomSubscription | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const game = typeof input.game === "string" && gameSet.has(input.game)
    ? input.game as OnlineRoomRealtimeGame
    : null;
  const code = normalizeOnlineRoomCode(input.code);
  return input.type === "subscribe" && game && code ? { type: "subscribe", game, code } : null;
}

export function parseOnlineRoomRevisionEvent(value: unknown): OnlineRoomRevisionEvent | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const game = typeof input.game === "string" && gameSet.has(input.game)
    ? input.game as OnlineRoomRealtimeGame
    : null;
  const code = normalizeOnlineRoomCode(input.code);
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
  return `${game}:${normalizeOnlineRoomCode(code)}`;
}
