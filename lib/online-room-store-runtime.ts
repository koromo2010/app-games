import { isMultiplayerRoomExpired } from "./multiplayer-room-lifecycle.ts";
import {
  onlineRoomNonDebugPlayerActiveRoomKeys,
} from "./online-room-debug-participants.ts";
import {
  deleteIndexedOnlineRoomStorage,
  dissolveHostedIndexedOnlineRooms,
  dissolveIndexedOnlineRoom,
} from "./online-room-dissolution.ts";
import { loadIndexedOnlineRoomPage } from "./online-room-list.ts";
import {
  createIndexedOnlineRoom,
  mutateOnlineRoomWithRetry,
} from "./online-room-persistence.ts";
import type { OnlineRoomRealtimeGame } from "./online-room-realtime-protocol.ts";
import {
  claimOnlineRoomForPlayer,
  loadPlayerActiveOnlineRoom,
  releasePlayerActiveRoom,
  type ActiveRoomClaim,
} from "./player-active-room.ts";
import { redisCommand } from "./redis-store.ts";
import type { DissolvableGameId } from "./room-dissolve-policy.ts";

type PlatformOnlineRoomPlayer = {
  id: string;
  name: string;
  isDummy?: boolean;
};

type PlatformOnlineRoom = {
  code: string;
  hostId: string;
  phase: string;
  players: PlatformOnlineRoomPlayer[];
  revision: number;
  updatedAt: number;
  round?: number;
  roundsTotal?: number;
};

type RuntimeErrors = {
  notFound: string;
  invalid: string;
  conflict: string;
  playerActive: string;
  forbidden: string;
  inProgress: string;
};

type PlatformOnlineRoomRuntimeOptions<
  TRoom extends PlatformOnlineRoom,
  TChoice extends { updatedAt: number },
> = {
  gameId: DissolvableGameId & OnlineRoomRealtimeGame;
  normalize: (value: unknown) => TRoom | null;
  normalizeMutation?: (value: unknown) => TRoom | null;
  isJoinable: (room: TRoom) => boolean;
  toChoice: (room: TRoom) => TChoice;
  errors: RuntimeErrors;
  afterSave?: (room: TRoom) => Promise<unknown>;
};

type MutateOptions<TRoom extends PlatformOnlineRoom> = {
  prepare?: (
    current: TRoom,
    changed: TRoom,
    context: { revision: number; timestamp: number },
  ) => TRoom;
};

export type PlatformOnlineRoomStoreRuntime<
  TRoom extends PlatformOnlineRoom,
  TChoice extends { updatedAt: number },
> = {
  roomKey(code: string): string;
  playerActiveRoomKey(playerId: string): string;
  activeRoomKeys(room: TRoom): string[];
  parse(raw: string | null): TRoom | null;
  load(code: string): Promise<TRoom | null>;
  loadActive(
    playerId: string,
    loadRoom?: (code: string) => Promise<TRoom | null>,
  ): Promise<TRoom | null>;
  claim(
    playerId: string,
    targetCode: string,
    loadRoom?: (code: string) => Promise<TRoom | null>,
  ): Promise<ActiveRoomClaim | null>;
  release(playerId: string, roomCode: string): Promise<void>;
  releaseMany(playerIds: Iterable<string>, roomCode: string): Promise<void>;
  create(
    room: TRoom,
    actorId?: string,
    loadRoom?: (code: string) => Promise<TRoom | null>,
  ): Promise<TRoom>;
  mutate(
    code: string,
    mutation: (room: TRoom) => TRoom | Promise<TRoom>,
    options?: MutateOptions<TRoom>,
  ): Promise<TRoom>;
  listAll(): Promise<TRoom[]>;
  list(cursor?: unknown): Promise<{ rooms: TChoice[]; nextCursor: string | null }>;
  deleteStorage(roomCode: string, playerIds: Iterable<string>): Promise<void>;
  dissolve(code: string, actorId: string): Promise<void>;
  dissolveHosted(actorId: string): Promise<number>;
};

export function createPlatformOnlineRoomStoreRuntime<
  TRoom extends PlatformOnlineRoom,
  TChoice extends { updatedAt: number },
>({
  gameId,
  normalize,
  normalizeMutation = normalize,
  isJoinable,
  toChoice,
  errors,
  afterSave,
}: PlatformOnlineRoomRuntimeOptions<TRoom, TChoice>): PlatformOnlineRoomStoreRuntime<TRoom, TChoice> {
  const roomIndexKey = `${gameId}:rooms`;
  const roomKey = (code: string) => `${gameId}:room:${code.trim().toUpperCase()}`;
  const playerActiveRoomKey = (playerId: string) => (
    `${gameId}:player-active-room:${playerId.trim()}`
  );
  const activeRoomKeys = (room: TRoom) => (
    onlineRoomNonDebugPlayerActiveRoomKeys(room.players, playerActiveRoomKey)
  );

  const deleteStorage = async (
    roomCode: string,
    playerIds: Iterable<string>,
  ) => {
    await deleteIndexedOnlineRoomStorage({
      roomCode,
      roomKey: roomKey(roomCode),
      roomIndexKey,
      playerActiveRoomKeys: [...playerIds].map(playerActiveRoomKey),
    });
  };

  const parse = (raw: string | null): TRoom | null => {
    if (!raw) return null;
    try {
      return normalize(JSON.parse(raw));
    } catch {
      return null;
    }
  };

  const load = async (code: string): Promise<TRoom | null> => {
    const raw = await redisCommand<string | null>(["GET", roomKey(code)]);
    const room = parse(raw);
    if (!room) return null;
    if (isMultiplayerRoomExpired(room.updatedAt)) {
      await deleteStorage(room.code, room.players.map((player) => player.id));
      return null;
    }
    return room;
  };

  const loadActive = (
    playerId: string,
    loadRoom: (code: string) => Promise<TRoom | null> = load,
  ) => loadPlayerActiveOnlineRoom(playerId, {
    key: playerActiveRoomKey,
    loadRoom,
    isMember: (room, id) => room.players.some((player) => player.id === id),
  });

  const release = (playerId: string, roomCode: string) => (
    releasePlayerActiveRoom(playerActiveRoomKey(playerId), roomCode)
  );

  const releaseMany = async (
    playerIds: Iterable<string>,
    roomCode: string,
  ) => {
    await Promise.all(
      [...new Set(playerIds)].map((playerId) => release(playerId, roomCode)),
    );
  };

  const claim = async (
    playerId: string,
    targetCode: string,
    loadRoom: (code: string) => Promise<TRoom | null> = load,
  ) => {
    const activeRoom = await loadActive(playerId, loadRoom);
    return claimOnlineRoomForPlayer({
      key: playerActiveRoomKey(playerId),
      targetCode,
      currentRoom: activeRoom,
      gameId,
      conflictError: errors.playerActive,
    });
  };

  const mutate = (
    code: string,
    mutation: (room: TRoom) => TRoom | Promise<TRoom>,
    options: MutateOptions<TRoom> = {},
  ) => mutateOnlineRoomWithRetry({
    code,
    roomKey,
    loadRoom: load,
    mutate: mutation,
    normalize: normalizeMutation,
    prepare: options.prepare,
    activeRoomKeys,
    afterSave,
    realtimeGame: gameId,
    errors,
  });

  const dissolutionOptions = {
    gameId,
    roomIndexKey,
    roomKey,
    playerActiveRoomKey,
    errors: {
      forbidden: errors.forbidden,
      inProgress: errors.inProgress,
    },
    loadRoom: load,
  };

  return {
    roomKey,
    playerActiveRoomKey,
    activeRoomKeys,
    parse,
    load,
    loadActive,
    claim,
    release,
    releaseMany,
    async create(room, actorId = "", loadRoom = load) {
      const claimResult = actorId
        ? await claim(actorId, room.code, loadRoom)
        : null;
      try {
        await createIndexedOnlineRoom(room, {
          roomKey,
          roomIndexKey,
          activeRoomKeys,
          conflictError: errors.conflict,
        });
        return room;
      } catch (error) {
        if (actorId && claimResult === "claimed") {
          await release(actorId, room.code);
        }
        throw error;
      }
    },
    mutate,
    async listAll() {
      const codes = await redisCommand<string[]>(["SMEMBERS", roomIndexKey]);
      const rooms = await Promise.all(codes.map(load));
      const missingCodes = codes.filter((_, index) => !rooms[index]);
      if (missingCodes.length > 0) {
        await redisCommand<number>(["SREM", roomIndexKey, ...missingCodes]);
      }
      return rooms.reduce<TRoom[]>((availableRooms, room) => {
        if (room) availableRooms.push(room as TRoom);
        return availableRooms;
      }, []);
    },
    async list(cursor) {
      const page = await loadIndexedOnlineRoomPage(cursor, {
        indexKey: roomIndexKey,
        roomKey,
        parseRoom: parse,
        loadRoom: load,
      });
      const rooms = page.rooms
        .filter((room): room is TRoom => Boolean(
          room
          && !isMultiplayerRoomExpired(room.updatedAt)
          && isJoinable(room)
        ))
        .map(toChoice)
        .sort((left, right) => right.updatedAt - left.updatedAt);
      return { rooms, nextCursor: page.nextCursor };
    },
    deleteStorage,
    dissolve: (code, actorId) => (
      dissolveIndexedOnlineRoom(code, actorId, dissolutionOptions)
    ),
    dissolveHosted: (actorId) => (
      dissolveHostedIndexedOnlineRooms(actorId, dissolutionOptions)
    ),
  };
}
