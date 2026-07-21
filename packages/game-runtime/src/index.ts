import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkRoomSnapshot,
  GameSdkStoredRoom,
  GameSdkTrustedActor,
} from "@game-fields/game-sdk";
import {
  gameSdkViewerFromActor,
  type GameSdkServerModule,
} from "@game-fields/game-sdk/runtime";

export const GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION = 1 as const;

export type GameFieldsAuthenticatedIdentity = {
  playerId: string;
  displayName: string;
  debugAccess: boolean;
};

export type GameFieldsPlatformRoomRecord<TRoom extends GameSdkStoredRoom> = {
  schemaVersion: typeof GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION;
  gameId: string;
  code: string;
  revision: number;
  phase: string;
  hostPlayerId: string;
  createdAt: number;
  updatedAt: number;
  room: TRoom;
};

export type GameFieldsPlatformCreateResult = "created" | "exists";
export type GameFieldsPlatformCompareAndSetResult = "saved" | "conflict" | "missing";

export type GameFieldsPlatformRoomPersistence<TRoom extends GameSdkStoredRoom> = {
  create(record: GameFieldsPlatformRoomRecord<TRoom>): Promise<GameFieldsPlatformCreateResult>;
  load(code: string): Promise<GameFieldsPlatformRoomRecord<TRoom> | null>;
  compareAndSet(
    expectedRevision: number,
    record: GameFieldsPlatformRoomRecord<TRoom>,
  ): Promise<GameFieldsPlatformCompareAndSetResult>;
};

export type GameFieldsPlatformRuntimeErrorCode =
  | "ROOM_ALREADY_EXISTS"
  | "ROOM_NOT_FOUND"
  | "STALE_REVISION"
  | "ROOM_CODE_CHANGED"
  | "INVALID_INITIAL_REVISION"
  | "INVALID_NEXT_REVISION"
  | "INVALID_PLATFORM_IDENTITY"
  | "INVALID_STORED_ROOM";

export class GameFieldsPlatformRuntimeError extends Error {
  readonly code: GameFieldsPlatformRuntimeErrorCode;
  readonly status: number;

  constructor(code: GameFieldsPlatformRuntimeErrorCode, status: number) {
    super(code);
    this.name = "GameFieldsPlatformRuntimeError";
    this.code = code;
    this.status = status;
  }
}

type PlatformRuntimeOptions<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  module: GameSdkServerModule<TRoom, TCreateInput, TCommand, TRoomView>;
  persistence: GameFieldsPlatformRoomPersistence<TRoom>;
  now?: () => number;
  createRequestId?: () => string;
};

export type GameFieldsPlatformRuntime<
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  createRoom(input: {
    roomCode: string;
    create: TCreateInput;
    identity: GameFieldsAuthenticatedIdentity;
  }): Promise<GameSdkRoomSnapshot<TRoomView>>;
  readRoom(input: {
    code: string;
    identity: GameFieldsAuthenticatedIdentity;
  }): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  sendCommand(input: {
    code: string;
    envelope: GameSdkCommandEnvelope<TCommand>;
    identity: GameFieldsAuthenticatedIdentity;
  }): Promise<GameSdkCommandResult<TRoomView>>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function trustedActor(
  identity: GameFieldsAuthenticatedIdentity,
  hostPlayerId: string,
): GameSdkTrustedActor {
  const playerId = identity.playerId.trim();
  const displayName = identity.displayName.trim();
  if (!playerId || !displayName) {
    throw new GameFieldsPlatformRuntimeError("INVALID_PLATFORM_IDENTITY", 500);
  }
  return {
    playerId,
    displayName,
    role: playerId === hostPlayerId ? "host" : "player",
    debugAccess: identity.debugAccess === true,
  };
}

function assertStoredRecord<TRoom extends GameSdkStoredRoom>(
  record: GameFieldsPlatformRoomRecord<TRoom>,
  gameId: string,
  code: string,
) {
  if (
    record.schemaVersion !== GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION
    || record.gameId !== gameId
    || record.code !== code
    || record.room.code !== code
    || record.revision !== record.room.revision
    || record.phase !== record.room.phase
    || !Number.isSafeInteger(record.revision)
    || record.revision < 1
    || !record.hostPlayerId.trim()
  ) {
    throw new GameFieldsPlatformRuntimeError("INVALID_STORED_ROOM", 500);
  }
}

function snapshot<TRoom extends GameSdkStoredRoom, TRoomView>(
  room: Readonly<TRoom>,
  view: TRoomView,
): GameSdkRoomSnapshot<TRoomView> {
  return clone({
    code: room.code,
    revision: room.revision,
    phase: room.phase,
    view,
  });
}

/**
 * Internal adapter core. Callers must resolve identity from a signed platform
 * session before invoking it; browser request bodies never supply identity.
 */
export function createGameFieldsPlatformRuntime<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
>({
  module,
  persistence,
  now = Date.now,
  createRequestId = () => crypto.randomUUID(),
}: PlatformRuntimeOptions<TRoom, TCreateInput, TCommand, TRoomView>): GameFieldsPlatformRuntime<TCreateInput, TCommand, TRoomView> {
  const present = (room: Readonly<TRoom>, actor: GameSdkTrustedActor, timestamp: number) => snapshot(
    room,
    module.presentRoom(clone(room), {
      viewer: gameSdkViewerFromActor(actor),
      now: timestamp,
    }),
  );

  return {
    async createRoom({ roomCode, create, identity }) {
      const timestamp = now();
      const actor = trustedActor(identity, identity.playerId.trim());
      const room = await module.createRoom(clone(create), {
        actor: clone(actor),
        now: timestamp,
        requestId: createRequestId(),
        roomCode,
      });
      if (room.code !== roomCode) {
        throw new GameFieldsPlatformRuntimeError("ROOM_CODE_CHANGED", 500);
      }
      if (room.revision !== 1) {
        throw new GameFieldsPlatformRuntimeError("INVALID_INITIAL_REVISION", 500);
      }
      const record: GameFieldsPlatformRoomRecord<TRoom> = {
        schemaVersion: GAME_FIELDS_PLATFORM_ROOM_SCHEMA_VERSION,
        gameId: module.manifest.id,
        code: room.code,
        revision: room.revision,
        phase: room.phase,
        hostPlayerId: actor.playerId,
        createdAt: timestamp,
        updatedAt: timestamp,
        room: clone(room),
      };
      const result = await persistence.create(record);
      if (result === "exists") {
        throw new GameFieldsPlatformRuntimeError("ROOM_ALREADY_EXISTS", 409);
      }
      return present(room, actor, timestamp);
    },

    async readRoom({ code, identity }) {
      const record = await persistence.load(code);
      if (!record) return null;
      assertStoredRecord(record, module.manifest.id, code);
      const actor = trustedActor(identity, record.hostPlayerId);
      return present(record.room, actor, now());
    },

    async sendCommand({ code, envelope, identity }) {
      const record = await persistence.load(code);
      if (!record) throw new GameFieldsPlatformRuntimeError("ROOM_NOT_FOUND", 404);
      assertStoredRecord(record, module.manifest.id, code);
      if (record.revision !== envelope.expectedRevision) {
        throw new GameFieldsPlatformRuntimeError("STALE_REVISION", 409);
      }
      const timestamp = now();
      const actor = trustedActor(identity, record.hostPlayerId);
      const nextRoom = await module.applyCommand(
        clone(record.room),
        clone(envelope.command),
        {
          actor: clone(actor),
          now: timestamp,
          requestId: createRequestId(),
        },
      );
      if (nextRoom.code !== record.room.code) {
        throw new GameFieldsPlatformRuntimeError("ROOM_CODE_CHANGED", 500);
      }
      if (nextRoom.revision !== record.revision + 1) {
        throw new GameFieldsPlatformRuntimeError("INVALID_NEXT_REVISION", 500);
      }
      const nextRecord: GameFieldsPlatformRoomRecord<TRoom> = {
        ...record,
        revision: nextRoom.revision,
        phase: nextRoom.phase,
        updatedAt: timestamp,
        room: clone(nextRoom),
      };
      const saved = await persistence.compareAndSet(record.revision, nextRecord);
      if (saved === "missing") throw new GameFieldsPlatformRuntimeError("ROOM_NOT_FOUND", 404);
      if (saved === "conflict") throw new GameFieldsPlatformRuntimeError("STALE_REVISION", 409);
      const room = present(nextRoom, actor, timestamp);
      return { room, revision: room.revision };
    },
  };
}
