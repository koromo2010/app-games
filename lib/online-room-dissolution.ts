import { type DissolvableGameId, canDissolveOnlineRoom } from "@/lib/room-dissolve-policy";
import { releasePlayerActiveRoom } from "@/lib/player-active-room";
import { redisCommand } from "@/lib/redis-store";

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

async function releaseIndexedRoom<Room extends IndexedOnlineRoom>(
  room: Room,
  options: IndexedRoomDissolutionOptions<Room>,
) {
  await redisCommand<number>(["DEL", options.roomKey(room.code)]);
  await redisCommand<number>(["SREM", options.roomIndexKey, room.code]);
  await Promise.all(room.players.map((player) => releasePlayerActiveRoom(
    options.playerActiveRoomKey(player.id),
    room.code,
  )));
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
