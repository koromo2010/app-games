import { multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import type { OnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";
import { redisCommand } from "./redis-store.ts";

type SpectatorPolicy = { enabled: boolean; roomCreatedAt: number; updatedAt: number };

function key(game: OnlineRoomRealtimeGame, code: string) {
  return `online-room-spectator:v1:${game}:${code}`;
}

export async function loadOnlineRoomSpectatorPolicy(game: OnlineRoomRealtimeGame, code: string, roomCreatedAt: number) {
  const raw = await redisCommand<string | null>(["GET", key(game, code)]);
  if (!raw) return { enabled: false, roomCreatedAt, updatedAt: 0 } satisfies SpectatorPolicy;
  try {
    const value = JSON.parse(raw) as Partial<SpectatorPolicy>;
    return value.enabled === true && value.roomCreatedAt === roomCreatedAt
      ? { enabled: true, roomCreatedAt, updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0 }
      : { enabled: false, roomCreatedAt, updatedAt: 0 };
  } catch {
    return { enabled: false, roomCreatedAt, updatedAt: 0 };
  }
}

export async function saveOnlineRoomSpectatorPolicy(game: OnlineRoomRealtimeGame, code: string, roomCreatedAt: number, enabled: boolean) {
  const policy: SpectatorPolicy = { enabled, roomCreatedAt, updatedAt: Date.now() };
  await redisCommand<string>(["SET", key(game, code), JSON.stringify(policy), "EX", String(multiplayerRoomTtlSeconds)]);
  return policy;
}
