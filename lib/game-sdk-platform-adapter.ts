import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkRoomListPage,
  GameSdkRoomSnapshot,
  GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import type { GameSdkServerModule } from "@game-fields/game-sdk/runtime";
import type {
  GameSdkPlatformResources,
} from "@game-fields/game-sdk/resources";
import {
  createGameFieldsPlatformRuntime,
  type GameFieldsAuthenticatedIdentity,
  type GameFieldsPlatformRoomPersistence,
} from "@game-fields/game-runtime";
import {
  createRedisGameSdkPlatformPersistence,
  createRedisGameSdkPlatformRoomStore,
  normalizeGameSdkPlatformRoomCode,
  type GameSdkPlatformRoomStore,
} from "./game-sdk-platform-room-store.ts";

export {
  createRedisGameSdkPlatformPersistence,
  gameSdkPlatformRoomIndexKey,
  gameSdkPlatformRoomKey,
  normalizeGameSdkPlatformRoomCode,
} from "./game-sdk-platform-room-store.ts";

type IdentityResolver = () => Promise<GameFieldsAuthenticatedIdentity>;

type AuthenticatedPlatformAdapterOptions<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  module: GameSdkServerModule<TRoom, TCreateInput, TCommand, TRoomView>;
  persistence?: GameFieldsPlatformRoomPersistence<TRoom>;
  roomStore?: GameSdkPlatformRoomStore<TRoom>;
  resolveIdentity?: IdentityResolver;
  now?: () => number;
  createRequestId?: () => string;
  resources?: Readonly<GameSdkPlatformResources>;
};

export type AuthenticatedGameSdkPlatformAdapter<
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  createRoom(input: {
    roomCode: string;
    create: TCreateInput;
  }): Promise<GameSdkRoomSnapshot<TRoomView>>;
  readRoom(code: string): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  readActiveRoom(): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  listRooms(cursor?: string | null): Promise<GameSdkRoomListPage>;
  sendCommand(input: {
    code: string;
    envelope: GameSdkCommandEnvelope<TCommand>;
  }): Promise<GameSdkCommandResult<TRoomView>>;
  dissolveRoom(code: string): Promise<boolean>;
  dissolveHostedRooms(): Promise<number>;
};

async function resolveAuthenticatedIdentity(supportsDebug: boolean): Promise<GameFieldsAuthenticatedIdentity> {
  const [{ requireAuthenticatedPlayer }, { playerHasDebugAccess }] = await Promise.all([
    import("./player-auth.ts"),
    import("./debug-access.ts"),
  ]);
  const player = await requireAuthenticatedPlayer();
  return {
    playerId: player.id,
    displayName: player.name,
    debugAccess: supportsDebug ? await playerHasDebugAccess(player.id) : false,
  };
}

/**
 * Game Fields server adapter. Its public methods intentionally omit actor or
 * player IDs; every operation resolves identity from the signed HttpOnly
 * player session before delegating to the private platform Runtime.
 */
export function createAuthenticatedGameSdkPlatformAdapter<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
>({
  module,
  persistence: persistenceInput,
  roomStore: roomStoreInput,
  resolveIdentity = () => resolveAuthenticatedIdentity(module.manifest.supportsDebug),
  now,
  createRequestId,
  resources,
}: AuthenticatedPlatformAdapterOptions<TRoom, TCreateInput, TCommand, TRoomView>): AuthenticatedGameSdkPlatformAdapter<TCreateInput, TCommand, TRoomView> {
  const roomStore = roomStoreInput
    ?? (persistenceInput ? null : createRedisGameSdkPlatformRoomStore<TRoom>(module.manifest.id));
  const persistence = roomStore
    ?? persistenceInput
    ?? createRedisGameSdkPlatformPersistence<TRoom>(module.manifest.id);
  const runtime = createGameFieldsPlatformRuntime({
    module,
    persistence,
    now,
    createRequestId,
    resources,
  });

  return {
    async createRoom({ roomCode, create }) {
      const identity = await resolveIdentity();
      const normalizedCode = normalizeGameSdkPlatformRoomCode(roomCode);
      const claim = roomStore
        ? await roomStore.claimActiveRoom(identity.playerId, normalizedCode)
        : null;
      try {
        const room = await runtime.createRoom({
          roomCode: normalizedCode,
          create,
          identity,
        });
        const record = roomStore ? await roomStore.load(normalizedCode) : null;
        if (record) await roomStore!.publishRevision(record);
        return room;
      } catch (error) {
        if (claim) await roomStore!.rollbackActiveRoomClaim(claim);
        throw error;
      }
    },

    async readRoom(code) {
      const identity = await resolveIdentity();
      return runtime.readRoom({
        code: normalizeGameSdkPlatformRoomCode(code),
        identity,
      });
    },

    async readActiveRoom() {
      const identity = await resolveIdentity();
      if (!roomStore) throw new Error("GAME_SDK_LIFECYCLE_UNAVAILABLE");
      const record = await roomStore.loadActiveRoom(identity.playerId);
      if (!record) return null;
      return runtime.readRoom({ code: record.code, identity });
    },

    async listRooms(cursor) {
      await resolveIdentity();
      if (!roomStore) throw new Error("GAME_SDK_LIFECYCLE_UNAVAILABLE");
      return roomStore.listRooms(cursor, module.manifest.maximumPlayers);
    },

    async sendCommand({ code, envelope }) {
      const identity = await resolveIdentity();
      const normalizedCode = normalizeGameSdkPlatformRoomCode(code);
      const lifecycleType = envelope.command.type;
      const claim = roomStore && lifecycleType === "room/join"
        ? await roomStore.claimActiveRoom(identity.playerId, normalizedCode)
        : null;
      try {
        const result = await runtime.sendCommand({
          code: normalizedCode,
          envelope,
          identity,
        });
        if (roomStore && lifecycleType === "room/leave") {
          await roomStore.releaseActiveRoom(identity.playerId, normalizedCode);
        }
        const record = roomStore ? await roomStore.load(normalizedCode) : null;
        if (record) await roomStore!.publishRevision(record);
        return result;
      } catch (error) {
        if (claim) await roomStore!.rollbackActiveRoomClaim(claim);
        throw error;
      }
    },

    async dissolveRoom(code) {
      const identity = await resolveIdentity();
      if (!roomStore) throw new Error("GAME_SDK_LIFECYCLE_UNAVAILABLE");
      const record = await roomStore.dissolveRoom(
        normalizeGameSdkPlatformRoomCode(code),
        identity.playerId,
      );
      if (record) await roomStore.publishRevision(record, record.revision + 1);
      return Boolean(record);
    },

    async dissolveHostedRooms() {
      const identity = await resolveIdentity();
      if (!roomStore) throw new Error("GAME_SDK_LIFECYCLE_UNAVAILABLE");
      const records = await roomStore.dissolveHostedRooms(identity.playerId);
      await Promise.all(records.map(
        (record) => roomStore.publishRevision(record, record.revision + 1),
      ));
      return records.length;
    },
  };
}
