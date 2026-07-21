import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkRoomSnapshot,
  GameSdkStoredRoom,
} from "@game-fields/game-sdk";
import type { GameSdkServerModule } from "@game-fields/game-sdk/runtime";
import {
  createGameFieldsPlatformRuntime,
  GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION,
  type GameFieldsAuthenticatedIdentity,
  type GameFieldsPlatformRoomPersistence,
  type GameFieldsPlatformRoomRecord,
} from "@game-fields/game-runtime";
import { createIndexedOnlineRoom, compareAndSetOnlineRoom } from "./online-room-persistence.ts";
import { redisCommand } from "./redis-store.ts";

const maximumPlatformRoomBytes = 512_000;
const platformRoomCreateConflict = "GAME_SDK_PLATFORM_ROOM_ALREADY_EXISTS";

type IdentityResolver = () => Promise<GameFieldsAuthenticatedIdentity>;

type AuthenticatedPlatformAdapterOptions<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  module: GameSdkServerModule<TRoom, TCreateInput, TCommand, TRoomView>;
  persistence?: GameFieldsPlatformRoomPersistence<TRoom>;
  resolveIdentity?: IdentityResolver;
  now?: () => number;
  createRequestId?: () => string;
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
  sendCommand(input: {
    code: string;
    envelope: GameSdkCommandEnvelope<TCommand>;
  }): Promise<GameSdkCommandResult<TRoomView>>;
};

export function normalizeGameSdkPlatformRoomCode(value: string) {
  const code = value.normalize("NFKC").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) throw new Error("GAME_SDK_INVALID_ROOM_CODE");
  return code;
}

function roomPrefix(gameId: string) {
  return `game-sdk-runtime:v1:${gameId}`;
}

export function gameSdkPlatformRoomKey(gameId: string, code: string) {
  return `${roomPrefix(gameId)}:room:${normalizeGameSdkPlatformRoomCode(code)}`;
}

export function gameSdkPlatformRoomIndexKey(gameId: string) {
  return `${roomPrefix(gameId)}:rooms`;
}

function serializedRecord<TRoom extends GameSdkStoredRoom>(record: GameFieldsPlatformRoomRecord<TRoom>) {
  const value = JSON.stringify(record);
  if (Buffer.byteLength(value, "utf8") > maximumPlatformRoomBytes) {
    throw new Error("GAME_SDK_PLATFORM_ROOM_TOO_LARGE");
  }
  return value;
}

function parseRecord<TRoom extends GameSdkStoredRoom>(raw: string, gameId: string, code: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GAME_SDK_INVALID_STORED_ROOM");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("GAME_SDK_INVALID_STORED_ROOM");
  const record = parsed as Partial<GameFieldsPlatformRoomRecord<TRoom>>;
  const room = record.room as Partial<TRoom> | undefined;
  if (
    record.schemaVersion !== GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION
    || record.gameId !== gameId
    || record.code !== code
    || typeof record.hostPlayerId !== "string"
    || !record.hostPlayerId.trim()
    || !Number.isSafeInteger(record.revision)
    || typeof record.phase !== "string"
    || typeof record.createdAt !== "number"
    || typeof record.updatedAt !== "number"
    || !room
    || room.code !== code
    || room.revision !== record.revision
    || room.phase !== record.phase
  ) {
    throw new Error("GAME_SDK_INVALID_STORED_ROOM");
  }
  return record as GameFieldsPlatformRoomRecord<TRoom>;
}

export function createRedisGameSdkPlatformPersistence<TRoom extends GameSdkStoredRoom>(
  gameId: string,
): GameFieldsPlatformRoomPersistence<TRoom> {
  return {
    async create(record) {
      serializedRecord(record);
      try {
        await createIndexedOnlineRoom(record, {
          roomKey: (code) => gameSdkPlatformRoomKey(gameId, code),
          roomIndexKey: gameSdkPlatformRoomIndexKey(gameId),
          conflictError: platformRoomCreateConflict,
        });
        return "created";
      } catch (error) {
        if (error instanceof Error && error.message === platformRoomCreateConflict) return "exists";
        throw error;
      }
    },

    async load(codeInput) {
      const code = normalizeGameSdkPlatformRoomCode(codeInput);
      const raw = await redisCommand<string | null>(["GET", gameSdkPlatformRoomKey(gameId, code)]);
      return raw ? parseRecord<TRoom>(raw, gameId, code) : null;
    },

    async compareAndSet(expectedRevision, record) {
      serializedRecord(record);
      const result = await compareAndSetOnlineRoom(
        expectedRevision,
        record,
        (code) => gameSdkPlatformRoomKey(gameId, code),
      );
      if (result === 1) return "saved";
      if (result === -1) return "missing";
      return "conflict";
    },
  };
}

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
  persistence = createRedisGameSdkPlatformPersistence<TRoom>(module.manifest.id),
  resolveIdentity = () => resolveAuthenticatedIdentity(module.manifest.supportsDebug),
  now,
  createRequestId,
}: AuthenticatedPlatformAdapterOptions<TRoom, TCreateInput, TCommand, TRoomView>): AuthenticatedGameSdkPlatformAdapter<TCreateInput, TCommand, TRoomView> {
  const runtime = createGameFieldsPlatformRuntime({
    module,
    persistence,
    now,
    createRequestId,
  });

  return {
    async createRoom({ roomCode, create }) {
      const identity = await resolveIdentity();
      return runtime.createRoom({
        roomCode: normalizeGameSdkPlatformRoomCode(roomCode),
        create,
        identity,
      });
    },

    async readRoom(code) {
      const identity = await resolveIdentity();
      return runtime.readRoom({
        code: normalizeGameSdkPlatformRoomCode(code),
        identity,
      });
    },

    async sendCommand({ code, envelope }) {
      const identity = await resolveIdentity();
      return runtime.sendCommand({
        code: normalizeGameSdkPlatformRoomCode(code),
        envelope,
        identity,
      });
    },
  };
}
