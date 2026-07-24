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
import {
  defineGameSdkStandardResult,
  type GameSdkStandardResult,
  type GameSdkStandardResultView,
} from "./modules/result.js";
import {
  createGameSdkPlayerTimeoutState,
  gameSdkPlayerTimeLimitSeconds,
  recordGameSdkPlayerActivity,
  recordGameSdkPlayerTimeout,
  recoverGameSdkPlayerTimeout,
  type GameSdkPlayerTimeoutState,
} from "./modules/timeout.js";

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
  lobbyReturn: GameSdkLobbyReturnState;
  playerTimeouts: GameSdkPlayerTimeoutState<string>;
  standardResult?: GameSdkStandardResult<string>;
  app: TAppState;
};

export type GameSdkLobbyReturnState = {
  required: boolean;
  confirmedPlayerIds: string[];
};

export type GameSdkOnlineRoomTimer = {
  durationSeconds: number;
  startedAt: number | null;
  deadlineAt: number | null;
  turnSequence: number;
  ownerPlayerId?: string | null;
};

export type GameSdkOnlineRoomTimerView = Omit<
  GameSdkOnlineRoomTimer,
  "ownerPlayerId"
> & {
  ownerSeat?: number | null;
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
  isDummy: boolean;
  isHost: boolean;
  isSelf: boolean;
  reducedTime: boolean;
};

export type GameSdkOnlineRoomCommonView<TSettings> = {
  phase: string;
  players: GameSdkOnlineRoomPlayerView[];
  settings: TSettings;
  timer?: GameSdkOnlineRoomTimerView;
  pendingLobbyReturnSeats: number[];
  minimumPlayers: number;
  maximumPlayers: number;
  isHost: boolean;
  isMember: boolean;
  permissions: GameSdkViewPermissions;
  standardResult?: GameSdkStandardResultView;
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
  /** Player whose next deadline is being started; null means a shared timer. */
  timerOwnerPlayerId?: string | null;
  /**
   * Platform result consumed by the common result, stats, rating and replay
   * modules. Internal player IDs stay in stored state and are projected to
   * seats before the browser receives the RoomView.
   */
  standardResult?: GameSdkStandardResult<string>;
};

export type GameSdkExpiredTurnTransition<TAppState> =
  GameSdkAppTransition<TAppState> & {
    timedOutPlayerIds: string[];
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
    graceMs?: number;
  };
  expireAppTurn?(
    room: Readonly<GameSdkOnlineRoom<TSettings, TAppState>>,
    context: GameSdkCommandContext,
  ): GameSdkExpiredTurnTransition<TAppState>
    | Promise<GameSdkExpiredTurnTransition<TAppState>>;
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
    supportsDebug?: boolean;
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
  if (
    command.type === "room/debug-add-dummy"
    || command.type === "room/debug-remove-dummy"
  ) {
    if (
      !options.supportsDebug
      || !context.actor.debugAccess
      || context.actor.playerId !== room.hostPlayerId
    ) {
      throw new Error("DEBUG_ACCESS_REQUIRED");
    }
    if (room.phase !== "lobby") throw new Error("DEBUG_LOBBY_ONLY");
    if (command.type === "room/debug-add-dummy") {
      if (room.players.length >= options.maximumPlayers) throw new Error("ROOM_FULL");
      const dummyCount = room.players.filter((player) => player.isDummy).length;
      return {
        handled: true,
        room: advanceGameSdkRoom(room, {
          players: [...room.players, {
            id: `debug:${context.requestId}`,
            displayName: `ダミー${dummyCount + 1}`,
            joinedAt: context.now,
            connected: false,
            isDummy: true,
          }],
        } as Partial<TRoom>),
      };
    }
    const seat = "seat" in command && Number.isSafeInteger(command.seat)
      ? command.seat
      : -1;
    const target = room.players[seat];
    if (!target?.isDummy) throw new Error("DEBUG_DUMMY_REQUIRED");
    return {
      handled: true,
      room: advanceGameSdkRoom(room, {
        players: room.players.filter((_player, index) => index !== seat),
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
  const manifestSettings = appSet.manifest.settings ?? [];
  const manifestKeys = new Set(manifestSettings.map((setting) => setting.key));
  const defaultKeys = Object.keys(appSet.defaultSettings);
  if (
    defaultKeys.length !== manifestKeys.size
    || defaultKeys.some((key) => !manifestKeys.has(key))
  ) {
    throw new Error("Game SDK AppSet defaultSettings must match manifest.settings.");
  }
  for (const setting of manifestSettings) {
    if (!Object.is(appSet.defaultSettings[setting.key], setting.defaultValue)) {
      throw new Error(`Game SDK AppSet default for ${setting.key} must match manifest defaultValue.`);
    }
  }
  const timeLimitSetting = manifestSettings.find(
    (setting) => setting.platformRole === "time-limit",
  );
  if (
    !timeLimitSetting
    || !appSet.timer
    || !appSet.expireAppTurn
    || appSet.timer.durationSeconds(appSet.defaultSettings)
      !== timeLimitSetting.defaultValue
  ) {
    throw new Error("Game SDK AppSet timer must use the manifest time-limit setting and expireAppTurn.");
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
  ownerPlayerId: string | null = null,
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
    ownerPlayerId,
  };
}

function createCommonPlayerView(
  player: GameSdkRoomPlayer,
  seat: number,
  room: { hostPlayerId: string },
  viewer: GameSdkViewer,
  playerTimeouts: GameSdkPlayerTimeoutState<string>,
): GameSdkOnlineRoomPlayerView {
  return {
    seat,
    displayName: player.displayName,
    connected: player.connected,
    isDummy: player.isDummy === true,
    isHost: player.id === room.hostPlayerId,
    isSelf: player.id === viewer.playerId,
    reducedTime: playerTimeouts.statuses[player.id]?.reducedTime === true,
  };
}

function gameSdkRoomTimeoutState(
  room: Readonly<{
    players: GameSdkRoomPlayer[];
    playerTimeouts?: GameSdkPlayerTimeoutState<string>;
  }>,
) {
  return room.playerTimeouts ?? createGameSdkPlayerTimeoutState(
    room.players.map((player) => player.id),
  );
}

function gameSdkRoomLobbyReturnState(
  room: Readonly<{
    lobbyReturn?: GameSdkLobbyReturnState;
  }>,
): GameSdkLobbyReturnState {
  return room.lobbyReturn ?? {
    required: false,
    confirmedPlayerIds: [],
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

  return defineGameServerModule<
    GameSdkOnlineRoom<TSettings, TAppState>,
    GameSdkOnlineRoomCreateInput<TSettings, TAppInput>,
    GameSdkOnlineRoomCommand<TSettings, TAppCommand>,
    GameSdkOnlineRoomView<TSettings, TAppView>
  >({
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
        lobbyReturn: {
          required: false,
          confirmedPlayerIds: [],
        },
        playerTimeouts: createGameSdkPlayerTimeoutState([
          context.actor.playerId,
        ]),
        ...(appSet.timer ? {
          timer: stoppedGameSdkTimer(timerDurationSeconds(settings)),
        } : {}),
        app,
      };
    },

    async applyCommand(room, command, context) {
      const currentPlayerTimeouts = gameSdkRoomTimeoutState(room);
      const currentLobbyReturn = gameSdkRoomLobbyReturnState(room);
      if (command.type === "room/confirm-lobby-return") {
        if (room.phase !== "lobby" || !currentLobbyReturn.required) {
          throw new Error("LOBBY_RETURN_NOT_REQUIRED");
        }
        if (!room.players.some((player) => player.id === context.actor.playerId)) {
          throw new Error("PLAYER_NOT_IN_ROOM");
        }
        return advanceGameSdkRoom(room, {
          lobbyReturn: {
            required: true,
            confirmedPlayerIds: [
              ...new Set([
                ...currentLobbyReturn.confirmedPlayerIds,
                context.actor.playerId,
              ]),
            ],
          },
        });
      }
      if (command.type === "room/recover-timeout") {
        const recovered = recoverGameSdkPlayerTimeout(
          currentPlayerTimeouts,
          context.actor.playerId,
          context.now,
        );
        if (!recovered) throw new Error("PLAYER_TIMEOUT_RECOVERY_NOT_REQUIRED");
        return advanceGameSdkRoom(room, { playerTimeouts: recovered });
      }
      if (command.type === "room/expire-timer") {
        const expireCommand = command as {
          type: "room/expire-timer";
          turnSequence: number;
        };
        if (!appSet.timer || !room.timer || !appSet.expireAppTurn) {
          throw new Error("TIMER_EXPIRY_UNSUPPORTED");
        }
        if (
          !Number.isSafeInteger(expireCommand.turnSequence)
          || expireCommand.turnSequence !== room.timer.turnSequence
        ) {
          throw new Error("TIMER_EVENT_STALE");
        }
        const graceMs = Math.max(
          0,
          Math.min(30_000, Math.floor(appSet.timer.graceMs ?? 1_500)),
        );
        if (
          room.phase === "lobby"
          || room.phase === "result"
          || room.timer.deadlineAt === null
          || context.now < room.timer.deadlineAt + graceMs
        ) {
          throw new Error("TIMER_NOT_EXPIRED");
        }
        const transition = await appSet.expireAppTurn(
          room,
          { ...context, resources: { ...resources, ...context.resources } },
        );
        const timedOutPlayerIds = [...new Set(transition.timedOutPlayerIds)];
        if (
          timedOutPlayerIds.length === 0
          || timedOutPlayerIds.some((playerId) => (
            !room.players.some((player) => player.id === playerId)
          ))
        ) {
          throw new Error("TIMER_TIMEOUT_PLAYERS_INVALID");
        }
        let playerTimeouts = currentPlayerTimeouts;
        for (const playerId of timedOutPlayerIds) {
          playerTimeouts = recordGameSdkPlayerTimeout(
            playerTimeouts,
            playerId,
            context.now,
          );
        }
        const nextPhase = normalizeAppSetPhase(transition.phase);
        const standardResult = transition.standardResult
          ? defineGameSdkStandardResult(transition.standardResult, {
              participantIds: room.players.map((player) => player.id),
            })
          : room.standardResult;
        if (nextPhase !== "result" && transition.standardResult) {
          throw new Error("RESULT_PHASE_REQUIRED");
        }
        const ownerPlayerId = transition.timerOwnerPlayerId ?? null;
        const timer = nextPhase === "result" || transition.timer === "stop"
          ? stoppedGameSdkTimer(timerDurationSeconds(room.settings), room.timer)
          : resetGameSdkTimer(
              gameSdkPlayerTimeLimitSeconds(
                timerDurationSeconds(room.settings),
                playerTimeouts,
                ownerPlayerId,
              ),
              context.now,
              room.timer,
              ownerPlayerId,
            );
        return advanceGameSdkRoom(room, {
          phase: nextPhase,
          app: transition.app,
          playerTimeouts,
          timer,
          ...(standardResult ? { standardResult } : {}),
        });
      }
      const lifecycle = applyGameSdkRoomLifecycleCommand(room, command, context, {
        minimumPlayers: manifest.minimumPlayers,
        maximumPlayers: manifest.maximumPlayers,
        supportsDebug: manifest.supportsDebug,
        normalizeSettings,
        resetGame: (current) => ({
          app: appSet.resetAppState(current),
          standardResult: undefined,
          lobbyReturn: command.type === "room/rematch"
            ? {
                required: true,
                confirmedPlayerIds: current.players
                  .filter((player) => (
                    player.id === current.hostPlayerId
                    || player.isDummy === true
                  ))
                  .map((player) => player.id),
              }
            : {
                required: false,
                confirmedPlayerIds: [],
              },
        }),
      });
      if (lifecycle.handled) {
        const joinedPlayerIds = lifecycle.room.players
          .filter((player) => (
            !room.players.some((previous) => previous.id === player.id)
          ))
          .map((player) => player.id);
        const lifecycleLobbyReturn = gameSdkRoomLobbyReturnState(
          lifecycle.room,
        );
        const confirmedPlayerIds = lifecycleLobbyReturn.required
          ? lifecycle.room.players
              .filter((player) => (
                lifecycleLobbyReturn.confirmedPlayerIds.includes(player.id)
                || joinedPlayerIds.includes(player.id)
                || player.id === lifecycle.room.hostPlayerId
                || player.isDummy === true
              ))
              .map((player) => player.id)
          : [];
        const timeoutDefaults = createGameSdkPlayerTimeoutState(
          lifecycle.room.players.map((player) => player.id),
        );
        const lifecycleRoom = {
          ...lifecycle.room,
          lobbyReturn: {
            required: lifecycleLobbyReturn.required,
            confirmedPlayerIds,
          },
          playerTimeouts: {
            ...timeoutDefaults,
            statuses: Object.fromEntries(
              lifecycle.room.players.map((player) => [
                player.id,
                currentPlayerTimeouts.statuses[player.id]
                  ?? timeoutDefaults.statuses[player.id]!,
              ]),
            ),
          },
        };
        if (!appSet.timer || !lifecycleRoom.timer) return lifecycleRoom;
        const shouldStop = (
          command.type === "room/abort"
          || command.type === "room/rematch"
          || lifecycleRoom.phase === "lobby"
          || lifecycleRoom.phase === "result"
        );
        return {
          ...lifecycleRoom,
          timer: shouldStop
            ? stoppedGameSdkTimer(
                timerDurationSeconds(lifecycleRoom.settings),
                lifecycleRoom.timer,
              )
            : lifecycleRoom.timer,
        };
      }
      if (command.type.startsWith("room/")) throw new Error("UNKNOWN_ROOM_COMMAND");
      if (!room.players.some((player) => player.id === context.actor.playerId)) {
        throw new Error("PLAYER_NOT_IN_ROOM");
      }
      const pendingLobbyReturns = currentLobbyReturn.required
        ? room.players.filter((player) => (
            !currentLobbyReturn.confirmedPlayerIds.includes(player.id)
          ))
        : [];
      if (room.phase === "lobby" && pendingLobbyReturns.length > 0) {
        throw new Error("LOBBY_RETURN_PENDING");
      }
      const transition = await appSet.applyAppCommand(
        room,
        command as TAppCommand,
        { ...context, resources: { ...resources, ...context.resources } },
      ) as GameSdkAppTransition<TAppState>;
      const nextPhase = normalizeAppSetPhase(transition.phase);
      const standardResult = transition.standardResult
        ? defineGameSdkStandardResult(transition.standardResult, {
            participantIds: room.players.map((player) => player.id),
          })
        : room.standardResult;
      if (nextPhase !== "result" && transition.standardResult) {
        throw new Error("RESULT_PHASE_REQUIRED");
      }
      const playerTimeouts = recordGameSdkPlayerActivity(
        currentPlayerTimeouts,
        context.actor.playerId,
      );
      const timerOwnerPlayerId =
        transition.timerOwnerPlayerId ?? context.actor.playerId;
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
              gameSdkPlayerTimeLimitSeconds(
                timerDurationSeconds(room.settings),
                playerTimeouts,
                timerOwnerPlayerId,
              ),
              context.now,
              room.timer,
              timerOwnerPlayerId,
            )
          : timerAction === "stop"
            ? stoppedGameSdkTimer(
                timerDurationSeconds(room.settings),
                room.timer,
              )
            : room.timer;
      const lobbyReturn = room.phase === "lobby" && nextPhase !== "lobby"
        ? {
            required: false,
            confirmedPlayerIds: [],
          }
        : currentLobbyReturn;
      return advanceGameSdkRoom(room, {
        phase: nextPhase,
        ...(nextTimer ? { timer: nextTimer } : {}),
        ...(standardResult ? { standardResult } : {}),
        lobbyReturn,
        playerTimeouts,
        app: transition.app,
      });
    },

    presentRoom(room, context) {
      const playerTimeouts = gameSdkRoomTimeoutState(room);
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
      const lobbyReturn = gameSdkRoomLobbyReturnState(room);
      const pendingLobbyReturnSeats = lobbyReturn.required
        ? room.players.flatMap((player, seat) => (
            lobbyReturn.confirmedPlayerIds.includes(player.id) ? [] : [seat]
          ))
        : [];
      const standardResult = room.standardResult
        ? {
            winnerSeats: room.standardResult.winnerIds.flatMap((winnerId) => {
              const seat = room.players.findIndex((player) => player.id === winnerId);
              return seat >= 0 ? [seat] : [];
            }),
            rankings: room.standardResult.rankings.flatMap((ranking) => {
              const seat = room.players.findIndex(
                (player) => player.id === ranking.participantId,
              );
              const player = room.players[seat];
              return seat >= 0 && player
                ? [{
                    seat,
                    displayName: player.displayName,
                    rank: ranking.rank,
                    score: ranking.score,
                    isSelf: player.id === context.viewer.playerId,
                  }]
                : [];
            }),
            reason: room.standardResult.reason,
          } satisfies GameSdkStandardResultView
        : undefined;
      return {
        common: {
          phase: room.phase,
          players: room.players.map((player, seat) => (
            createCommonPlayerView(
              player,
              seat,
              room,
              context.viewer,
              playerTimeouts,
            )
          )),
          settings: room.settings,
          ...(room.timer ? {
            timer: {
              durationSeconds: room.timer.durationSeconds,
              startedAt: room.timer.startedAt,
              deadlineAt: room.timer.deadlineAt,
              turnSequence: room.timer.turnSequence,
              ...(room.timer.ownerPlayerId === undefined ? {} : {
                ownerSeat: room.timer.ownerPlayerId === null
                  ? null
                  : room.players.findIndex(
                      (player) => player.id === room.timer?.ownerPlayerId,
                    ),
              }),
            },
          } : {}),
          pendingLobbyReturnSeats,
          minimumPlayers: manifest.minimumPlayers,
          maximumPlayers: manifest.maximumPlayers,
          isHost,
          isMember,
          permissions: {
            canStartGame: (
              isHost
              && room.phase === "lobby"
              && hasEnoughPlayers
              && pendingLobbyReturnSeats.length === 0
              && presented.canStartGame !== false
            ),
            canEditRoomSettings: isHost && room.phase === "lobby",
            canAbort: isHost && room.phase !== "lobby",
            canDebug: (
              manifest.supportsDebug
              && context.viewer.debugAccess
              && isHost
              && room.phase === "lobby"
            ),
            canSeeSecret: Boolean(presented.canSeeSecret),
          },
          ...(standardResult ? { standardResult } : {}),
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
