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

export function gameSdkDebugTargetActorSeat(
  state: Readonly<GameSdkDebugControlState>,
): number | null {
  return state.status === "ready" && state.target.mode === "dummy"
    ? state.target.seat
    : null;
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

export function gameSdkDebugControlCanSend(
  state: Readonly<GameSdkDebugControlState>,
): boolean {
  return state.status === "ready";
}

export function wrapGameSdkDebugCommand<TCommand extends { type: string }>(
  state: Readonly<GameSdkDebugControlState>,
  command: TCommand,
): TCommand | {
  type: "room/debug-act-as-dummy";
  seat: number;
  command: TCommand;
} {
  if (!gameSdkDebugControlCanSend(state)) {
    throw new Error("DEBUG_ACTOR_SWITCH_PENDING");
  }
  const actorSeat = gameSdkDebugTargetActorSeat(state);
  return actorSeat !== null && !command.type.startsWith("room/")
    ? {
        type: "room/debug-act-as-dummy",
        seat: actorSeat,
        command,
      }
    : command;
}
