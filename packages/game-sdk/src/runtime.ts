import type {
  GameSdkCommandEnvelope,
  GameSdkCommandResult,
  GameSdkManifest,
  GameSdkOnlineRoomState,
  GameSdkRoomPlayer,
  GameSdkRoomLifecycleCommand,
  GameSdkRoomSnapshot,
  GameSdkStoredRoom,
  GameSdkTrustedActor,
  GameSdkViewPermissions,
  GameSdkViewer,
} from "./index.js";
import type {
  GameSdkPlatformResources,
  GameSdkResourceContext,
} from "./resources.js";

export type GameSdkRoomLifecycleResult<TRoom> =
  | { handled: false }
  | { handled: true; room: TRoom };

/**
 * Platform-owned online room state with one isolated game-specific AppSet
 * state. AppSet code cannot replace the room code, host, players, settings or
 * revision because it only returns the nested `app` state and next phase.
 */
export type GameSdkOnlineRoom<
  TSettings extends Record<string, unknown>,
  TAppState,
> = GameSdkOnlineRoomState<TSettings> & {
  timer?: GameSdkOnlineRoomTimer;
  app: TAppState;
};

export type GameSdkOnlineRoomTimer = {
  durationSeconds: number;
  startedAt: number | null;
  deadlineAt: number | null;
  turnSequence: number;
};

/** Standard create payload used by every online-room AppSet. */
export type GameSdkOnlineRoomCreateInput<
  TSettings extends Record<string, unknown>,
  TAppInput,
> = {
  settings?: Partial<TSettings>;
  app: TAppInput;
};

/** Platform lifecycle Commands plus Commands owned by one AppSet. */
export type GameSdkOnlineRoomCommand<
  TSettings extends Record<string, unknown>,
  TAppCommand extends { type: string },
> = GameSdkRoomLifecycleCommand<TSettings> | TAppCommand;

export type GameSdkOnlineRoomPlayerView = {
  seat: number;
  displayName: string;
  connected: boolean;
  isHost: boolean;
  isSelf: boolean;
};

export type GameSdkOnlineRoomCommonView<TSettings> = {
  phase: string;
  players: GameSdkOnlineRoomPlayerView[];
  settings: TSettings;
  timer?: GameSdkOnlineRoomTimer;
  minimumPlayers: number;
  maximumPlayers: number;
  isHost: boolean;
  isMember: boolean;
  permissions: GameSdkViewPermissions;
};

/**
 * Browser-safe composition returned by the SDK basic set.
 *
 * `common` is rendered by the Game Fields shell. `app` is the only surface a
 * game package owns. Stored player IDs are intentionally not exposed here.
 */
export type GameSdkOnlineRoomView<TSettings, TAppView> = {
  common: GameSdkOnlineRoomCommonView<TSettings>;
  app: TAppView;
};

export type GameSdkAppTransition<TAppState> = {
  phase: string;
  app: TAppState;
  /**
   * `reset` starts a fresh deadline after this Command is accepted.
   * Browser input must never set this directly; the reviewed AppSet returns it
   * from the authoritative server-side transition.
   */
  timer?: "preserve" | "reset" | "stop";
};

export type GameSdkAppPresentation<TAppView> = {
  view: TAppView;
  canSeeSecret?: boolean;
  canStartGame?: boolean;
};

/**
 * The game-specific half of an online game. Authentication, room lifecycle,
 * settings, participant membership, revision handling and common presentation
 * belong to the SDK basic set and are deliberately absent from this contract.
 */
export type GameSdkOnlineRoomAppSet<
  TSettings extends Record<string, unknown>,
  TAppState,
  TAppInput,
  TAppCommand extends { type: string },
  TAppView,
> = {
  manifest: GameSdkManifest;
  defaultSettings: TSettings;
  timer?: {
    durationSeconds(settings: Readonly<TSettings>): number;
  };
  normalizeSettings?: (settings: TSettings) => TSettings;
  createAppState(
    input: TAppInput,
    context: GameSdkCreateContext,
    settings: TSettings,
  ): TAppState | Promise<TAppState>;
  resetAppState(
    room: Readonly<GameSdkOnlineRoom<TSettings, TAppState>>,
  ): TAppState;
  applyAppCommand(
    room: Readonly<GameSdkOnlineRoom<TSettings, TAppState>>,
    command: TAppCommand,
    context: GameSdkCommandContext,
  ): GameSdkAppTransition<TAppState> | Promise<GameSdkAppTransition<TAppState>>;
  presentApp(
    room: Readonly<GameSdkOnlineRoom<TSettings, TAppState>>,
    context: GameSdkPresentationContext,
  ): GameSdkAppPresentation<TAppView>;
};

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

export type GameSdkCreateContext = GameSdkResourceContext & {
  actor: GameSdkTrustedActor;
  now: number;
  requestId: string;
  roomCode: string;
};

export type GameSdkCommandContext = GameSdkResourceContext & {
  actor: GameSdkTrustedActor;
  now: number;
  requestId: string;
};

export type GameSdkPresentationContext = GameSdkResourceContext & {
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

export function defineGameSdkOnlineRoomAppSet<
  TSettings extends Record<string, unknown>,
  TAppState,
  TAppInput,
  TAppCommand extends { type: string },
  TAppView,
>(
  appSet: GameSdkOnlineRoomAppSet<
    TSettings,
    TAppState,
    TAppInput,
    TAppCommand,
    TAppView
  >,
) {
  if (appSet.manifest.playMode !== "online-room") {
    throw new Error("Game SDK online AppSet requires an online-room manifest.");
  }
  return appSet;
}

function normalizeAppSetPhase(phase: string) {
  const normalized = phase.trim();
  if (
    normalized === "lobby"
    || !/^[a-z][A-Za-z0-9-]{0,63}$/.test(normalized)
  ) {
    throw new Error("APP_SET_INVALID_PHASE");
  }
  return normalized;
}

function normalizeGameSdkTimerDuration(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(3600, Math.max(0, Math.floor(value)));
}

function stoppedGameSdkTimer(
  durationSeconds: number,
  previous?: Readonly<GameSdkOnlineRoomTimer>,
): GameSdkOnlineRoomTimer {
  return {
    durationSeconds: normalizeGameSdkTimerDuration(durationSeconds),
    startedAt: null,
    deadlineAt: null,
    turnSequence: previous?.turnSequence ?? 0,
  };
}

function resetGameSdkTimer(
  durationSeconds: number,
  now: number,
  previous?: Readonly<GameSdkOnlineRoomTimer>,
): GameSdkOnlineRoomTimer {
  const normalizedDuration = normalizeGameSdkTimerDuration(durationSeconds);
  if (normalizedDuration === 0) {
    return stoppedGameSdkTimer(0, previous);
  }
  return {
    durationSeconds: normalizedDuration,
    startedAt: now,
    deadlineAt: now + normalizedDuration * 1000,
    turnSequence: (previous?.turnSequence ?? 0) + 1,
  };
}

function createCommonPlayerView(
  player: GameSdkRoomPlayer,
  seat: number,
  room: { hostPlayerId: string },
  viewer: GameSdkViewer,
): GameSdkOnlineRoomPlayerView {
  return {
    seat,
    displayName: player.displayName,
    connected: player.connected,
    isHost: player.id === room.hostPlayerId,
    isSelf: player.id === viewer.playerId,
  };
}

/**
 * Composes the platform-owned SDK basic set with one game-specific AppSet.
 *
 * Game packages should prefer this over implementing `createRoom`,
 * lifecycle Commands and common RoomView fields themselves.
 */
export function createGameSdkOnlineRoomModule<
  TSettings extends Record<string, unknown>,
  TAppState,
  TAppInput,
  TAppCommand extends { type: string },
  TAppView,
>(
  appSet: GameSdkOnlineRoomAppSet<
    TSettings,
    TAppState,
    TAppInput,
    TAppCommand,
    TAppView
  >,
  options: {
    resources?: Readonly<GameSdkPlatformResources>;
  } = {},
): GameSdkServerModule<
  GameSdkOnlineRoom<TSettings, TAppState>,
  GameSdkOnlineRoomCreateInput<TSettings, TAppInput>,
  GameSdkOnlineRoomCommand<TSettings, TAppCommand>,
  GameSdkOnlineRoomView<TSettings, TAppView>
> {
  const manifest = appSet.manifest;
  const resources = options.resources ?? {};
  if (manifest.playMode !== "online-room") {
    throw new Error("Game SDK online AppSet requires an online-room manifest.");
  }

  const normalizeSettings = (settings: TSettings) => (
    appSet.normalizeSettings ? appSet.normalizeSettings(settings) : settings
  );
  const timerDurationSeconds = (settings: Readonly<TSettings>) => (
    appSet.timer
      ? normalizeGameSdkTimerDuration(appSet.timer.durationSeconds(settings))
      : 0
  );

  return defineGameServerModule({
    manifest,

    async createRoom(input, context) {
      const settings = normalizeSettings({
        ...appSet.defaultSettings,
        ...(input.settings ?? {}),
      });
      const app = await appSet.createAppState(
        input.app,
        { ...context, resources: { ...resources, ...context.resources } },
        settings,
      ) as TAppState;
      return {
        code: context.roomCode,
        revision: 1,
        phase: "lobby",
        hostPlayerId: context.actor.playerId,
        players: [{
          id: context.actor.playerId,
          displayName: context.actor.displayName,
          joinedAt: context.now,
          connected: true,
        }],
        settings,
        ...(appSet.timer ? {
          timer: stoppedGameSdkTimer(timerDurationSeconds(settings)),
        } : {}),
        app,
      };
    },

    async applyCommand(room, command, context) {
      const lifecycle = applyGameSdkRoomLifecycleCommand(room, command, context, {
        minimumPlayers: manifest.minimumPlayers,
        maximumPlayers: manifest.maximumPlayers,
        normalizeSettings,
        resetGame: (current) => ({
          app: appSet.resetAppState(current),
        }),
      });
      if (lifecycle.handled) {
        if (!appSet.timer || !lifecycle.room.timer) return lifecycle.room;
        const shouldStop = (
          command.type === "room/abort"
          || command.type === "room/rematch"
          || lifecycle.room.phase === "lobby"
          || lifecycle.room.phase === "result"
        );
        return {
          ...lifecycle.room,
          timer: shouldStop
            ? stoppedGameSdkTimer(
                timerDurationSeconds(lifecycle.room.settings),
                lifecycle.room.timer,
              )
            : lifecycle.room.timer,
        };
      }
      if (command.type.startsWith("room/")) throw new Error("UNKNOWN_ROOM_COMMAND");
      if (!room.players.some((player) => player.id === context.actor.playerId)) {
        throw new Error("PLAYER_NOT_IN_ROOM");
      }
      const transition = await appSet.applyAppCommand(
        room,
        command as TAppCommand,
        { ...context, resources: { ...resources, ...context.resources } },
      ) as GameSdkAppTransition<TAppState>;
      const nextPhase = normalizeAppSetPhase(transition.phase);
      const timerAction = (
        nextPhase === "result"
        || nextPhase === "lobby"
        || transition.timer === "stop"
      )
        ? "stop"
        : (
            transition.timer === "reset"
            || (
              room.phase === "lobby"
              && nextPhase !== "lobby"
            )
          )
          ? "reset"
          : "preserve";
      const nextTimer = !appSet.timer || !room.timer
        ? undefined
        : timerAction === "reset"
          ? resetGameSdkTimer(
              timerDurationSeconds(room.settings),
              context.now,
              room.timer,
            )
          : timerAction === "stop"
            ? stoppedGameSdkTimer(
                timerDurationSeconds(room.settings),
                room.timer,
              )
            : room.timer;
      return advanceGameSdkRoom(room, {
        phase: nextPhase,
        ...(nextTimer ? { timer: nextTimer } : {}),
        app: transition.app,
      });
    },

    presentRoom(room, context) {
      const presented = appSet.presentApp(
        room,
        { ...context, resources: { ...resources, ...context.resources } },
      );
      const isHost = context.viewer.playerId === room.hostPlayerId;
      const isMember = Boolean(
        context.viewer.playerId
        && room.players.some((player) => player.id === context.viewer.playerId),
      );
      const hasEnoughPlayers = room.players.length >= manifest.minimumPlayers;
      return {
        common: {
          phase: room.phase,
          players: room.players.map((player, seat) => (
            createCommonPlayerView(
              player,
              seat,
              room,
              context.viewer,
            )
          )),
          settings: room.settings,
          ...(room.timer ? { timer: room.timer } : {}),
          minimumPlayers: manifest.minimumPlayers,
          maximumPlayers: manifest.maximumPlayers,
          isHost,
          isMember,
          permissions: {
            canStartGame: (
              isHost
              && room.phase === "lobby"
              && hasEnoughPlayers
              && presented.canStartGame !== false
            ),
            canEditRoomSettings: isHost && room.phase === "lobby",
            canAbort: isHost && room.phase !== "lobby",
            canDebug: manifest.supportsDebug && context.viewer.debugAccess,
            canSeeSecret: Boolean(presented.canSeeSecret),
          },
        },
        app: presented.view,
      };
    },
  });
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
