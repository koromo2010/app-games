import { multiplayerRoomExpiryArgs } from "@/lib/multiplayer-room-lifecycle";
import { redisCommand } from "@/lib/redis-store";

export type ActiveRoomClaim = "claimed" | "already-claimed";

export async function claimPlayerActiveRoom(key: string, roomCode: string): Promise<ActiveRoomClaim | null> {
  const result = await redisCommand<number>([
    "EVAL",
    "local current=redis.call('GET',KEYS[1]); if current then if string.upper(current)==string.upper(ARGV[1]) then redis.call('EXPIRE',KEYS[1],ARGV[2]); return 2 end; return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2]); return 1",
    "1",
    key,
    roomCode,
    multiplayerRoomExpiryArgs()[1],
  ]);
  if (result === 1) return "claimed";
  if (result === 2) return "already-claimed";
  return null;
}

export async function releasePlayerActiveRoom(key: string, roomCode: string) {
  await redisCommand<number>([
    "EVAL",
    "local current=redis.call('GET',KEYS[1]); if current and string.upper(current)==string.upper(ARGV[1]) then return redis.call('DEL',KEYS[1]) end; return 0",
    "1",
    key,
    roomCode,
  ]);
}
