export type GameSdkDebugViewer = "self" | "spectator" | number;

export type GameSdkDebugControlTarget =
  | { mode: "self" }
  | { mode: "spectator" }
  | { mode: "viewer"; seat: number }
  | { mode: "dummy"; seat: number };

export type GameSdkDebugControlState = {
  generation: number;
  target: GameSdkDebugControlTarget;
  status: "ready" | "switching";
};

export type GameSdkDebugViewerRequest = {
  generation: number;
  sequence: number;
};

export type GameSdkDebugViewerResponseDecision = {
  apply: boolean;
  refetch: boolean;
};

export const INITIAL_GAME_SDK_DEBUG_CONTROL_STATE: GameSdkDebugControlState = {
  generation: 0,
  target: { mode: "self" },
  status: "ready",
};

export function gameSdkDebugTargetViewer(
  target: GameSdkDebugControlTarget,
): GameSdkDebugViewer {
  if (target.mode === "dummy" || target.mode === "viewer") return target.seat;
  return target.mode;
}

/**
 * Returns the actor seat that is safe to use for command dispatch.
 * A switching target is intentionally not executable yet.
 */
export function gameSdkDebugTargetActorSeat(
  state: Readonly<GameSdkDebugControlState>,
): number | null {
  return state.status === "ready" && state.target.mode === "dummy"
    ? state.target.seat
    : null;
}

/**
 * Returns the actor seat selected in the DEBUG UI, even while its viewer
 * snapshot is still switching. This is display-only; command dispatch must
 * continue to use gameSdkDebugControlCanSend/gameSdkDebugTargetActorSeat.
 */
export function gameSdkDebugSelectedActorSeat(
  state: Readonly<GameSdkDebugControlState>,
): number | null {
  return state.target.mode === "dummy" ? state.target.seat : null;
}

export function beginGameSdkDebugControlSwitch(
  state: Readonly<GameSdkDebugControlState>,
  target: GameSdkDebugControlTarget,
): GameSdkDebugControlState {
  return {
    generation: state.generation + 1,
    target,
    status: target.mode === "self" ? "ready" : "switching",
  };
}

export function completeGameSdkDebugControlSwitch(
  state: Readonly<GameSdkDebugControlState>,
  generation: number,
): GameSdkDebugControlState {
  if (state.generation !== generation || state.status !== "switching") {
    return state;
  }
  return { ...state, status: "ready" };
}

export function resetGameSdkDebugControl(
  state: Readonly<GameSdkDebugControlState>,
): GameSdkDebugControlState {
  return {
    generation: state.generation + 1,
    target: { mode: "self" },
    status: "ready",
  };
}

export function beginGameSdkDebugViewerRequest(
  current: Readonly<GameSdkDebugViewerRequest> | null,
  generation: number,
  sequence: number,
): { request: GameSdkDebugViewerRequest; started: boolean } {
  if (current?.generation === generation) {
    return { request: current, started: false };
  }
  return {
    request: { generation, sequence },
    started: true,
  };
}

export function gameSdkDebugViewerRequestIsCurrent(
  current: Readonly<GameSdkDebugViewerRequest> | null,
  request: Readonly<GameSdkDebugViewerRequest>,
): boolean {
  return current?.generation === request.generation
    && current.sequence === request.sequence;
}

export function completeGameSdkDebugViewerRequest(
  current: Readonly<GameSdkDebugViewerRequest> | null,
  request: Readonly<GameSdkDebugViewerRequest>,
): GameSdkDebugViewerRequest | null {
  return gameSdkDebugViewerRequestIsCurrent(current, request) ? null : current;
}

export function decideGameSdkDebugViewerResponse(input: {
  state: Readonly<GameSdkDebugControlState>;
  generation: number;
  viewer: Exclude<GameSdkDebugViewer, "self">;
  requestedRoom: Readonly<{ code: string; revision: number }>;
  latestRoom: Readonly<{ code: string; revision: number }> | null;
}): GameSdkDebugViewerResponseDecision {
  const { state, generation, viewer, requestedRoom, latestRoom } = input;
  if (
    state.generation !== generation
    || gameSdkDebugTargetViewer(state.target) !== viewer
    || latestRoom?.code !== requestedRoom.code
  ) {
    return { apply: false, refetch: false };
  }
  return {
    apply: true,
    refetch: latestRoom.revision > requestedRoom.revision,
  };
}

/**
 * Strict execution readiness. Command wrapping and actor resolution must use
 * this value so a genuinely switching target can never act.
 */
export function gameSdkDebugControlCanSend(
  state: Readonly<GameSdkDebugControlState>,
): boolean {
  return state.status === "ready";
}

/**
 * Allows the frame transport to pass a command to the imperative wrapper.
 * React render state can briefly lag behind stateRef after a viewer snapshot
 * becomes visible. The wrapper performs the authoritative current-state check,
 * so transport must not reject solely from a stale rendered canSend value.
 */
export function gameSdkDebugControlCanDispatch(
  _state: Readonly<GameSdkDebugControlState>,
): boolean {
  return true;
}

export function wrapGameSdkDebugCommand<TCommand extends { type: string }>(
  state: Readonly<GameSdkDebugControlState>,
  command: TCommand,
): TCommand | {
  type: "room/debug-act-as-dummy";
  seat: number;
  command: TCommand;
} {
  const actorSeat = gameSdkDebugTargetActorSeat(state);
  const selectedSeat = gameSdkDebugSelectedActorSeat(state);
  console.debug("[DEBUG_ACTOR]", {
    status: state.status,
    actorSeat,
    selectedSeat,
    command: command.type,
    generation: state.generation,
    timestamp: typeof performance !== "undefined" ? performance.now() : Date.now(),
  });
  if (!gameSdkDebugControlCanSend(state)) {
    throw new Error("DEBUG_ACTOR_SWITCH_PENDING");
  }
  return actorSeat !== null && !command.type.startsWith("room/")
    ? {
        type: "room/debug-act-as-dummy",
        seat: actorSeat,
        command,
      }
    : command;
}
