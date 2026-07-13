import { redisCommand } from "@/lib/redis-store";
export { actionRequiresDebugAccess, roomRequestsDebugMode } from "@/lib/debug-access-policy";

const debugAccessKeyPrefix = "player-debug-access:";

function debugAccessKey(playerId: string) {
  return `${debugAccessKeyPrefix}${playerId.trim()}`;
}

export async function playerHasDebugAccess(playerId: string) {
  if (!playerId.trim()) return false;
  return (await redisCommand<string | null>(["GET", debugAccessKey(playerId)])) === "1";
}

export async function setPlayerDebugAccess(playerId: string, enabled: boolean) {
  if (!playerId.trim()) throw new Error("DEBUG_ACCESS_PLAYER_REQUIRED");
  if (enabled) await redisCommand<"OK">(["SET", debugAccessKey(playerId), "1"]);
  else await redisCommand<number>(["DEL", debugAccessKey(playerId)]);
  return enabled;
}

export async function requirePlayerDebugAccess(playerId: string) {
  if (!(await playerHasDebugAccess(playerId))) throw new Error("DEBUG_ACCESS_REQUIRED");
}
