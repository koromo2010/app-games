import { type DissolvableGameId, canDissolveOnlineRoom } from "./room-dissolve-policy.ts";
import { redisCommand } from "./redis-store.ts";

type IndexedOnlineRoom = {
  code: string;
  hostId: string;
  phase: string;
  players: Array<{ id: string }>;
  round?: number;
  roundsTotal?: number;
};

type DissolutionErrors = {
  forbidden: string;
  inProgress: string;
};

type IndexedRoomDissolutionOptions<Room extends IndexedOnlineRoom> = {
  gameId: DissolvableGameId;
  roomIndexKey: string;
  roomKey: (code: string) => string;
  playerActiveRoomKey: (playerId: string) => string;
  errors: DissolutionErrors;
  loadRoom: (code: string) => Promise<Room | null>;
};

export async function deleteIndexedOnlineRoomStorage(options: {
  roomCode: string;
  roomKey: string;
  roomIndexKey: string;
  playerActiveRoomKeys: string[];
}) {
  const playerActiveRoomKeys = [...new Set(options.playerActiveRoomKeys.filter(Boolean))];
  const keys = [options.roomKey, options.roomIndexKey, ...playerActiveRoomKeys];
  await redisCommand<number>([
    "EVAL",
    "redis.call('DEL',KEYS[1]); redis.call('SREM',KEYS[2],ARGV[1]); for i=3,#KEYS do local current=redis.call('GET',KEYS[i]); if current and string.upper(current)==string.upper(ARGV[1]) then redis.call('DEL',KEYS[i]) end end; return 1",
    String(keys.length),
    ...keys,
    options.roomCode,
  ]);
}

async function releaseIndexedRoom<Room extends IndexedOnlineRoom>(
  room: Room,
  options: IndexedRoomDissolutionOptions<Room>,
) {
  await deleteIndexedOnlineRoomStorage({
    roomCode: room.code,
    roomKey: options.roomKey(room.code),
    roomIndexKey: options.roomIndexKey,
    playerActiveRoomKeys: room.players.map((player) => options.playerActiveRoomKey(player.id)),
  });
}

function assertRoomCanBeDissolved<Room extends IndexedOnlineRoom>(
  room: Room,
  actorId: string,
  options: IndexedRoomDissolutionOptions<Room>,
) {
  if (room.hostId !== actorId) throw new Error(options.errors.forbidden);
  if (!canDissolveOnlineRoom(options.gameId, room)) throw new Error(options.errors.inProgress);
}

export async function dissolveIndexedOnlineRoom<Room extends IndexedOnlineRoom>(
  code: string,
  actorId: string,
  options: IndexedRoomDissolutionOptions<Room>,
) {
  const room = await options.loadRoom(code);
  if (!room) return;
  assertRoomCanBeDissolved(room, actorId, options);
  await releaseIndexedRoom(room, options);
}

export async function dissolveHostedIndexedOnlineRooms<Room extends IndexedOnlineRoom>(
  authenticatedHostId: string,
  options: IndexedRoomDissolutionOptions<Room>,
) {
  const activeCode = await redisCommand<string | null>(["GET", options.playerActiveRoomKey(authenticatedHostId)]);
  if (activeCode) {
    const activeRoom = await options.loadRoom(activeCode);
    if (activeRoom?.hostId === authenticatedHostId) {
      assertRoomCanBeDissolved(activeRoom, authenticatedHostId, options);
      await releaseIndexedRoom(activeRoom, options);
      return 1;
    }
  }

  // Legacy rooms created before the active-room index still need a one-time fallback scan.
  const codes = await redisCommand<string[]>(["SMEMBERS", options.roomIndexKey]);
  const rooms = await Promise.all(codes.map(options.loadRoom));
  const targets: Room[] = [];
  for (const room of rooms) {
    if (room && room.hostId === authenticatedHostId) targets.push(room);
  }
  for (const room of targets) assertRoomCanBeDissolved(room, authenticatedHostId, options);
  await Promise.all(targets.map((room) => releaseIndexedRoom(room, options)));
  return targets.length;
}
