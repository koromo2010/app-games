export type GameSdkRoundStep<TPhase extends string> = {
  round: number;
  phase: TPhase;
  complete: boolean;
};

/** Resolves the next non-excluded seat without leaking player IDs to the UI. */
export function nextGameSdkEligibleSeat<TId extends string>(
  participantIds: readonly TId[],
  currentSeat: number,
  excludedIds: ReadonlySet<TId> | readonly TId[] = [],
) {
  const ids = [...new Set(participantIds)];
  if (ids.length === 0) return -1;
  const excluded = excludedIds instanceof Set
    ? excludedIds
    : new Set(excludedIds);
  for (let offset = 1; offset <= ids.length; offset += 1) {
    const seat = (Math.max(-1, currentSeat) + offset) % ids.length;
    const id = ids[seat];
    if (id !== undefined && !excluded.has(id)) return seat;
  }
  return -1;
}

/** Shared round destination used by repeated submission and turn phases. */
export function nextGameSdkRoundStep<TPhase extends string>(options: {
  currentRound: number;
  totalRounds: number;
  repeatPhase: TPhase;
  completedPhase: TPhase;
}): GameSdkRoundStep<TPhase> {
  const currentRound = Math.max(1, Math.trunc(options.currentRound));
  const totalRounds = Math.max(
    currentRound,
    Math.trunc(options.totalRounds),
  );
  const complete = currentRound >= totalRounds;
  return {
    round: complete ? currentRound : currentRound + 1,
    phase: complete ? options.completedPhase : options.repeatPhase,
    complete,
  };
}

/** Common host/phase/minimum-player guard used before game-specific setup. */
export function assertGameSdkCanStart(options: {
  actorId: string;
  hostId: string;
  phase: string;
  participantCount: number;
  minimumPlayers: number;
  lobbyPhase?: string;
  errors?: {
    host?: string;
    phase?: string;
    participants?: string;
  };
}) {
  if (options.actorId !== options.hostId) {
    throw new Error(options.errors?.host ?? "HOST_REQUIRED");
  }
  if (options.phase !== (options.lobbyPhase ?? "lobby")) {
    throw new Error(options.errors?.phase ?? "LOBBY_REQUIRED");
  }
  if (options.participantCount < options.minimumPlayers) {
    throw new Error(
      options.errors?.participants ?? "NOT_ENOUGH_PLAYERS",
    );
  }
}

export function assertGameSdkPhase<TPhase extends string>(
  phase: string,
  allowedPhases: TPhase | readonly TPhase[],
  error = "INVALID_PHASE",
) {
  const allowed = Array.isArray(allowedPhases)
    ? allowedPhases
    : [allowedPhases];
  if (!allowed.includes(phase as TPhase)) throw new Error(error);
}
