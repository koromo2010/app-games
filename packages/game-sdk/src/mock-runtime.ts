import type {
  GameSdkCommandResult,
  GameSdkRoomSnapshot,
  GameSdkStoredRoom,
  GameSdkViewer,
} from "./index.js";
import {
  gameSdkViewerFromActor,
  type GameSdkServerModule,
  type GameSdkServerRuntime,
} from "./runtime.js";

export type GameSdkRuntimeErrorCode =
  | "ROOM_ALREADY_EXISTS"
  | "ROOM_NOT_FOUND"
  | "STALE_REVISION"
  | "ROOM_CODE_CHANGED"
  | "INVALID_INITIAL_REVISION"
  | "INVALID_NEXT_REVISION";

export class GameSdkRuntimeError extends Error {
  readonly code: GameSdkRuntimeErrorCode;
  readonly status: number;

  constructor(code: GameSdkRuntimeErrorCode, status: number) {
    super(code);
    this.name = "GameSdkRuntimeError";
    this.code = code;
    this.status = status;
  }
}

type MockRuntimeOptions<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  module: GameSdkServerModule<TRoom, TCreateInput, TCommand, TRoomView>;
  initialRooms?: readonly TRoom[];
  now?: () => number;
  createRequestId?: () => string;
};

export type GameSdkMockRuntime<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = GameSdkServerRuntime<TCreateInput, TCommand, TRoomView> & {
  inspectStoredRoom(code: string): TRoom | null;
};

function clone<T>(value: T): T {
  return structuredClone(value);
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
 * Dependency-free in-memory Runtime for game-package development and tests.
 * It deliberately has no DB, Redis, Cookie, admin or API-key access.
 */
export function createGameSdkMockRuntime<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
>({
  module,
  initialRooms = [],
  now = Date.now,
  createRequestId,
}: MockRuntimeOptions<TRoom, TCreateInput, TCommand, TRoomView>): GameSdkMockRuntime<TRoom, TCreateInput, TCommand, TRoomView> {
  const rooms = new Map<string, TRoom>();
  for (const room of initialRooms) {
    if (rooms.has(room.code)) throw new GameSdkRuntimeError("ROOM_ALREADY_EXISTS", 409);
    rooms.set(room.code, clone(room));
  }
  let requestSequence = 0;
  const nextRequestId = createRequestId ?? (() => `sdk-mock-${++requestSequence}`);

  const present = (room: Readonly<TRoom>, viewer: GameSdkViewer) => snapshot(
    room,
    module.presentRoom(clone(room), { viewer: clone(viewer), now: now() }),
  );

  return {
    async createRoom({ roomCode, create, actor }) {
      if (rooms.has(roomCode)) throw new GameSdkRuntimeError("ROOM_ALREADY_EXISTS", 409);
      const room = await module.createRoom(clone(create), {
        actor: clone(actor),
        now: now(),
        requestId: nextRequestId(),
        roomCode,
      });
      if (rooms.has(roomCode)) throw new GameSdkRuntimeError("ROOM_ALREADY_EXISTS", 409);
      if (room.code !== roomCode) throw new GameSdkRuntimeError("ROOM_CODE_CHANGED", 500);
      if (room.revision !== 1) throw new GameSdkRuntimeError("INVALID_INITIAL_REVISION", 500);
      rooms.set(room.code, clone(room));
      return present(room, gameSdkViewerFromActor(actor));
    },

    async readRoom(code, viewer) {
      const room = rooms.get(code);
      return room ? present(room, viewer) : null;
    },

    async sendCommand({ code, envelope, actor }): Promise<GameSdkCommandResult<TRoomView>> {
      const stored = rooms.get(code);
      if (!stored) throw new GameSdkRuntimeError("ROOM_NOT_FOUND", 404);
      if (stored.revision !== envelope.expectedRevision) {
        throw new GameSdkRuntimeError("STALE_REVISION", 409);
      }
      const nextRoom = await module.applyCommand(clone(stored), clone(envelope.command), {
        actor: clone(actor),
        now: now(),
        requestId: nextRequestId(),
      });
      const current = rooms.get(code);
      if (!current) throw new GameSdkRuntimeError("ROOM_NOT_FOUND", 404);
      if (current.revision !== envelope.expectedRevision) {
        throw new GameSdkRuntimeError("STALE_REVISION", 409);
      }
      if (nextRoom.code !== stored.code) throw new GameSdkRuntimeError("ROOM_CODE_CHANGED", 500);
      if (nextRoom.revision !== stored.revision + 1) {
        throw new GameSdkRuntimeError("INVALID_NEXT_REVISION", 500);
      }
      rooms.set(code, clone(nextRoom));
      const room = present(nextRoom, gameSdkViewerFromActor(actor));
      return { room, revision: room.revision };
    },

    inspectStoredRoom(code) {
      const room = rooms.get(code);
      return room ? clone(room) : null;
    },
  };
}
