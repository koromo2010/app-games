import { multiplayerRoomTtlSeconds } from "./multiplayer-room-lifecycle.ts";
import type { OnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";
import { redisCommand } from "./redis-store.ts";

type SpectatorPolicy = { enabled: boolean; roomCreatedAt: number; roomInstanceId?: string; grantVersion: number; updatedAt: number };

function key(game: OnlineRoomRealtimeGame, code: string) {
  return `online-room-spectator:v1:${game}:${code}`;
}

export async function loadOnlineRoomSpectatorPolicy(game: OnlineRoomRealtimeGame, code: string, roomCreatedAt: number, roomInstanceId?: string) {
  const raw = await redisCommand<string | null>(["GET", key(game, code)]);
  if (!raw) return { enabled: false, roomCreatedAt, roomInstanceId, grantVersion: 0, updatedAt: 0 } satisfies SpectatorPolicy;
  try {
    const value = JSON.parse(raw) as Partial<SpectatorPolicy>;
    const generationMatches = value.roomCreatedAt === roomCreatedAt
      && (!roomInstanceId || !value.roomInstanceId || value.roomInstanceId === roomInstanceId);
    return value.enabled === true && generationMatches
      ? { enabled: true, roomCreatedAt, roomInstanceId, grantVersion: Number.isSafeInteger(value.grantVersion) ? Number(value.grantVersion) : 0, updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0 }
      : { enabled: false, roomCreatedAt, roomInstanceId, grantVersion: Number.isSafeInteger(value.grantVersion) ? Number(value.grantVersion) : 0, updatedAt: 0 };
  } catch {
    return { enabled: false, roomCreatedAt, roomInstanceId, grantVersion: 0, updatedAt: 0 };
  }
}

export async function saveOnlineRoomSpectatorPolicy(game: OnlineRoomRealtimeGame, code: string, roomCreatedAt: number, enabled: boolean, roomInstanceId?: string) {
  const current = await loadOnlineRoomSpectatorPolicy(game, code, roomCreatedAt, roomInstanceId);
  const policy: SpectatorPolicy = { enabled, roomCreatedAt, roomInstanceId, grantVersion: current.grantVersion + 1, updatedAt: Date.now() };
  await redisCommand<string>(["SET", key(game, code), JSON.stringify(policy), "EX", String(multiplayerRoomTtlSeconds)]);
  return policy;
}
