import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkManifest,
  GameSdkOnlineRoomState,
  GameSdkRoomLifecycleCommand,
  GameSdkRoomSnapshot,
  GameSdkStoredRoom,
  GameSdkTrustedActor,
  GameSdkViewer,
} from "./index.js";

export type GameSdkRoomLifecycleResult<TRoom> =
  | { handled: false }
  | { handled: true; room: TRoom };

/**
 * Pure shared lifecycle reducer. Storage, sessions and CAS stay in the platform
 * Runtime; game modules call this before handling game-specific Commands.
 */
export function applyGameSdkRoomLifecycleCommand<
  TSettings extends Record<string, unknown>,
  TRoom extends GameSdkOnlineRoomState<TSettings>,
>(
  room: Readonly<TRoom>,
  command: GameSdkRoomLifecycleCommand<TSettings> | { type: string },
  context: GameSdkCommandContext,
  options: {
    minimumPlayers: number;
    maximumPlayers: number;
    normalizeSettings?: (settings: TSettings) => TSettings;
    resetGame: (room: Readonly<TRoom>) => Omit<Partial<TRoom>, "code" | "revision">;
  },
): GameSdkRoomLifecycleResult<TRoom> {
  if (command.type === "room/join") {
    if (room.phase !== "lobby") throw new Error("ROOM_NOT_JOINABLE");
    if (room.players.some((player) => player.id === context.actor.playerId)) {
      return { handled: true, room: advanceGameSdkRoom(room, {} as Omit<Partial<TRoom>, "code" | "revision">) };
    }
    if (room.players.length >= options.maximumPlayers) throw new Error("ROOM_FULL");
    return {
      handled: true,
      room: advanceGameSdkRoom(room, {
        players: [...room.players, {
          id: context.actor.playerId,
          displayName: context.actor.displayName,
          joinedAt: context.now,
          connected: true,
        }],
      } as Partial<TRoom>),
    };
  }
  if (command.type === "room/leave") {
    if (!room.players.some((player) => player.id === context.actor.playerId)) throw new Error("PLAYER_NOT_IN_ROOM");
    if (context.actor.playerId === room.hostPlayerId) throw new Error("HOST_MUST_DISSOLVE_ROOM");
    if (room.phase !== "lobby") throw new Error("GAME_IN_PROGRESS");
    return { handled: true, room: advanceGameSdkRoom(room, {
      players: room.players.filter((player) => player.id !== context.actor.playerId),
    } as Partial<TRoom>) };
  }
  if (command.type === "room/update-settings") {
    if (context.actor.playerId !== room.hostPlayerId) throw new Error("HOST_REQUIRED");
    if (room.phase !== "lobby") throw new Error("SETTINGS_LOCKED");
    const patch = "settings" in command && command.settings && typeof command.settings === "object"
      ? command.settings as Partial<TSettings>
      : {};
    const settings = { ...room.settings, ...patch } as TSettings;
    return { handled: true, room: advanceGameSdkRoom(room, {
      settings: options.normalizeSettings ? options.normalizeSettings(settings) : settings,
    } as Partial<TRoom>) };
  }
  if (command.type === "room/abort" || command.type === "room/rematch") {
    if (context.actor.playerId !== room.hostPlayerId) throw new Error("HOST_REQUIRED");
    if (command.type === "room/rematch" && room.phase !== "result") throw new Error("RESULT_REQUIRED");
    return { handled: true, room: advanceGameSdkRoom(room, {
      ...options.resetGame(room),
      phase: "lobby",
    }) };
  }
  return { handled: false };
}

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
