export const GAME_SDK_REDUCED_TIME_LIMIT_SECONDS = 5;
export const GAME_SDK_CONSECUTIVE_TIMEOUT_LIMIT = 2;

export type GameSdkPlayerTimeoutStatus = {
  consecutiveTimeouts: number;
  reducedTime: boolean;
};

export type GameSdkPlayerTimeoutNotice<TId extends string = string> = {
  playerId: TId;
  kind: "reduced" | "recovered";
  createdAt: number;
};

export type GameSdkPlayerTimeoutState<TId extends string = string> = {
  statuses: Record<TId, GameSdkPlayerTimeoutStatus>;
  notice: GameSdkPlayerTimeoutNotice<TId> | null;
};

export function createGameSdkPlayerTimeoutState<TId extends string>(
  participantIds: readonly TId[],
): GameSdkPlayerTimeoutState<TId> {
  return {
    statuses: Object.fromEntries(
      participantIds.map((participantId) => [
        participantId,
        { consecutiveTimeouts: 0, reducedTime: false },
      ]),
    ) as Record<TId, GameSdkPlayerTimeoutStatus>,
    notice: null,
  };
}

export function recordGameSdkPlayerActivity<TId extends string>(
  state: GameSdkPlayerTimeoutState<TId>,
  participantId: TId,
) {
  const current = state.statuses[participantId]
    ?? { consecutiveTimeouts: 0, reducedTime: false };
  if (current.reducedTime || current.consecutiveTimeouts === 0) return state;
  return {
    ...state,
    statuses: {
      ...state.statuses,
      [participantId]: { consecutiveTimeouts: 0, reducedTime: false },
    },
  };
}

export function recordGameSdkPlayerTimeout<TId extends string>(
  state: GameSdkPlayerTimeoutState<TId>,
  participantId: TId,
  now: number,
) {
  const current = state.statuses[participantId]
    ?? { consecutiveTimeouts: 0, reducedTime: false };
  if (current.reducedTime) return state;
  const consecutiveTimeouts = Math.min(
    GAME_SDK_CONSECUTIVE_TIMEOUT_LIMIT,
    current.consecutiveTimeouts + 1,
  );
  const reducedTime =
    consecutiveTimeouts >= GAME_SDK_CONSECUTIVE_TIMEOUT_LIMIT;
  return {
    statuses: {
      ...state.statuses,
      [participantId]: { consecutiveTimeouts, reducedTime },
    },
    notice: reducedTime
      ? { playerId: participantId, kind: "reduced" as const, createdAt: now }
      : state.notice,
  };
}

export function recoverGameSdkPlayerTimeout<TId extends string>(
  state: GameSdkPlayerTimeoutState<TId>,
  participantId: TId,
  now: number,
) {
  if (!state.statuses[participantId]?.reducedTime) return null;
  return {
    statuses: {
      ...state.statuses,
      [participantId]: { consecutiveTimeouts: 0, reducedTime: false },
    },
    notice: { playerId: participantId, kind: "recovered" as const, createdAt: now },
  };
}

export function gameSdkPlayerTimeLimitSeconds<TId extends string>(
  baseSeconds: number,
  state: GameSdkPlayerTimeoutState<TId>,
  participantId: TId | null,
) {
  if (!participantId || !state.statuses[participantId]?.reducedTime) {
    return baseSeconds;
  }
  return baseSeconds === 0
    ? 0
    : Math.min(baseSeconds, GAME_SDK_REDUCED_TIME_LIMIT_SECONDS);
}
