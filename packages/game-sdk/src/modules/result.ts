export type GameSdkStandardResult<TId extends string = string> = {
  winnerIds: TId[];
  rankings: Array<{
    participantId: TId;
    rank: number;
    score: number;
  }>;
  reason: string;
};

/** Validates the result contract consumed by result, stats and replay modules. */
export function defineGameSdkStandardResult<TId extends string>(
  result: GameSdkStandardResult<TId>,
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
  return {
    winnerIds,
    rankings,
    reason: result.reason.trim(),
  } satisfies GameSdkStandardResult<TId>;
}
