export type GameSdkStandardResult<TId extends string = string> = {
  winnerIds: TId[];
  rankings: Array<{
    participantId: TId;
    rank: number;
    score: number;
  }>;
  reason: string;
};

export type GameSdkStandardResultView = {
  winnerSeats: number[];
  rankings: Array<{
    seat: number;
    displayName: string;
    rank: number;
    score: number;
    isSelf: boolean;
  }>;
  reason: string;
};

export function defineGameSdkStandardResultView(
  result: GameSdkStandardResultView,
  options: { participantCount?: number } = {},
) {
  const winnerSeats = [...new Set(result.winnerSeats)]
    .filter((seat) => Number.isSafeInteger(seat) && seat >= 0);
  const rankings = [...result.rankings]
    .map((row) => ({
      seat: Math.max(0, Math.trunc(row.seat)),
      displayName: row.displayName.trim().slice(0, 40),
      rank: Math.max(1, Math.trunc(row.rank)),
      score: Number.isFinite(row.score) ? row.score : 0,
      isSelf: row.isSelf === true,
    }))
    .sort((left, right) => left.rank - right.rank);
  if (!result.reason.trim()) throw new Error("RESULT_REASON_REQUIRED");
  if (
    new Set(rankings.map((row) => row.seat)).size !== rankings.length
    || winnerSeats.some((seat) => !rankings.some((row) => row.seat === seat))
  ) {
    throw new Error("RESULT_SEAT_INVALID");
  }
  if (
    options.participantCount !== undefined
    && (
      rankings.length !== options.participantCount
      || rankings.some((row) => row.seat >= options.participantCount!)
    )
  ) {
    throw new Error("RESULT_PARTICIPANTS_MISMATCH");
  }
  return {
    winnerSeats,
    rankings,
    reason: result.reason.trim().slice(0, 200),
  } satisfies GameSdkStandardResultView;
}

/** Validates the result contract consumed by result, stats and replay modules. */
export function defineGameSdkStandardResult<TId extends string>(
  result: GameSdkStandardResult<TId>,
  options: {
    participantIds?: readonly TId[];
  } = {},
) {
  const winnerIds = [...new Set(result.winnerIds)];
  const rankings = [...result.rankings]
    .map((row) => ({
      ...row,
      rank: Math.max(1, Math.trunc(row.rank)),
      score: Number.isFinite(row.score) ? row.score : 0,
    }))
    .sort((left, right) => left.rank - right.rank);
  if (!result.reason.trim()) throw new Error("RESULT_REASON_REQUIRED");
  const rankedIds = rankings.map((row) => row.participantId);
  if (new Set(rankedIds).size !== rankedIds.length) {
    throw new Error("RESULT_PARTICIPANT_DUPLICATED");
  }
  if (winnerIds.some((winnerId) => !rankedIds.includes(winnerId))) {
    throw new Error("RESULT_WINNER_NOT_RANKED");
  }
  if (options.participantIds) {
    const participants = [...new Set(options.participantIds)];
    if (
      participants.length !== rankedIds.length
      || participants.some((participantId) => !rankedIds.includes(participantId))
    ) {
      throw new Error("RESULT_PARTICIPANTS_MISMATCH");
    }
  }
  return {
    winnerIds,
    rankings,
    reason: result.reason.trim(),
  } satisfies GameSdkStandardResult<TId>;
}
