import { multiplayerRoomExpiryArgs } from "./multiplayer-room-lifecycle.ts";
import { redisCommand } from "./redis-store.ts";
import { canMoveFromOnlineRoom, type DissolvableGameId } from "./room-dissolve-policy.ts";

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

type ActiveOnlineRoom = { code: string; phase: string; round?: number; roundsTotal?: number };

export async function claimOnlineRoomForPlayer(options: {
  key: string;
  targetCode: string;
  currentRoom: ActiveOnlineRoom | null;
  gameId: DissolvableGameId;
  conflictError: string;
}) {
  const targetCode = options.targetCode.trim().toUpperCase();
  if (options.currentRoom && options.currentRoom.code !== targetCode) {
    if (!canMoveFromOnlineRoom(options.gameId, options.currentRoom)) throw new Error(options.conflictError);
    await releasePlayerActiveRoom(options.key, options.currentRoom.code);
  }
  const claim = await claimPlayerActiveRoom(options.key, targetCode);
  if (!claim) throw new Error(options.conflictError);
  return claim;
}

export async function loadPlayerActiveOnlineRoom<Room>(playerId: string, options: {
  key: (playerId: string) => string;
  loadRoom: (code: string) => Promise<Room | null>;
  isMember: (room: Room, playerId: string) => boolean;
}) {
  const normalizedId = playerId.trim();
  if (!normalizedId) return null;
  const activeRoomKey = options.key(normalizedId);
  const code = await redisCommand<string | null>(["GET", activeRoomKey]);
  if (!code) return null;
  const room = await options.loadRoom(code);
  if (!room || !options.isMember(room, normalizedId)) {
    await releasePlayerActiveRoom(activeRoomKey, code);
    return null;
  }
  return room;
}

export async function saveOnlineRoomPlayerIndexes(
  roomCode: string,
  playerIds: string[],
  key: (playerId: string) => string,
) {
  await Promise.all(playerIds.map((playerId) => redisCommand<"OK">([
    "SET", key(playerId), roomCode, ...multiplayerRoomExpiryArgs(),
  ])));
}
