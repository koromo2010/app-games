import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkManifest,
  GameSdkRoomSnapshot,
  GameSdkStoredRoom,
  GameSdkTrustedActor,
  GameSdkViewer,
} from "./index.js";

export type GameSdkCreateContext = {
  actor: GameSdkTrustedActor;
  now: number;
  requestId: string;
  roomCode: string;
};

export type GameSdkCommandContext = {
  actor: GameSdkTrustedActor;
  now: number;
  requestId: string;
};

export type GameSdkPresentationContext = {
  viewer: GameSdkViewer;
  now: number;
};

/**
 * Server contract implemented by one game package. Authentication, storage,
 * CAS and request IDs remain platform responsibilities.
 */
export type GameSdkServerModule<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  manifest: GameSdkManifest;
  createRoom(input: TCreateInput, context: GameSdkCreateContext): TRoom | Promise<TRoom>;
  applyCommand(
    room: Readonly<TRoom>,
    command: TCommand,
    context: GameSdkCommandContext,
  ): TRoom | Promise<TRoom>;
  presentRoom(room: Readonly<TRoom>, context: GameSdkPresentationContext): TRoomView;
};

export type GameSdkServerRuntime<
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
> = {
  createRoom(input: {
    roomCode: string;
    create: TCreateInput;
    actor: GameSdkTrustedActor;
  }): Promise<GameSdkRoomSnapshot<TRoomView>>;
  readRoom(code: string, viewer: GameSdkViewer): Promise<GameSdkRoomSnapshot<TRoomView> | null>;
  sendCommand(input: {
    code: string;
    envelope: GameSdkCommandEnvelope<TCommand>;
    actor: GameSdkTrustedActor;
  }): Promise<GameSdkCommandResult<TRoomView>>;
};

export function gameSdkViewerFromActor(actor: GameSdkTrustedActor): GameSdkViewer {
  return {
    playerId: actor.playerId,
    role: actor.role,
    debugAccess: actor.debugAccess,
  };
}

export function defineGameServerModule<
  TRoom extends GameSdkStoredRoom,
  TCreateInput,
  TCommand extends { type: string },
  TRoomView,
>(module: GameSdkServerModule<TRoom, TCreateInput, TCommand, TRoomView>) {
  return module;
}

/** Helper for pure domains to produce the one-step revision required by CAS. */
export function advanceGameSdkRoom<TRoom extends GameSdkStoredRoom>(
  room: Readonly<TRoom>,
  updates: Omit<Partial<TRoom>, "code" | "revision">,
): TRoom {
  return {
    ...room,
    ...updates,
    code: room.code,
    revision: room.revision + 1,
  } as TRoom;
}
