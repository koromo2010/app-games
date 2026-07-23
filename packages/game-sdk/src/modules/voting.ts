import { recordGameSdkParticipantValue } from "./collection.js";

function distinctIds<TId extends string>(ids: readonly TId[]) {
  return [...new Set(ids)];
}

export type GameSdkVoteTally<TId extends string = string> = {
  counts: Record<TId, number>;
  maximumVotes: number;
  leaderIds: TId[];
  tied: boolean;
};

/** Records one vote. Games supply the current voter and target sets. */
export function recordGameSdkVote<TId extends string>(
  votes: Readonly<Partial<Record<TId, TId>>>,
  voterId: TId,
  targetId: TId,
  options: {
    voterIds: readonly TId[];
    targetIds: readonly TId[];
    allowSelfVote?: boolean;
    allowReplace?: boolean;
    errors?: {
      voter?: string;
      target?: string;
      selfVote?: string;
      alreadySubmitted?: string;
    };
  },
) {
  const voterIds = distinctIds(options.voterIds);
  const targetIds = distinctIds(options.targetIds);
  if (!voterIds.includes(voterId)) {
    throw new Error(options.errors?.voter ?? "VOTER_REQUIRED");
  }
  if (!targetIds.includes(targetId)) {
    throw new Error(options.errors?.target ?? "INVALID_VOTE_TARGET");
  }
  if (!options.allowSelfVote && voterId === targetId) {
    throw new Error(
      options.errors?.selfVote ?? "SELF_VOTE_NOT_ALLOWED",
    );
  }
  return recordGameSdkParticipantValue(votes, voterId, targetId, {
    participantIds: voterIds,
    allowReplace: options.allowReplace,
    errors: {
      participant: options.errors?.voter,
      alreadySubmitted:
        options.errors?.alreadySubmitted ?? "VOTE_ALREADY_SUBMITTED",
    },
  });
}

/** Counts only votes cast for the supplied target set and reports every leader. */
export function tallyGameSdkVotes<TId extends string>(
  votes: Readonly<Partial<Record<TId, TId>>>,
  targetIds: readonly TId[],
): GameSdkVoteTally<TId> {
  const ids = distinctIds(targetIds);
  const counts = Object.fromEntries(
    ids.map((id) => [id, 0]),
  ) as Record<TId, number>;
  for (const targetId of Object.values(votes) as Array<TId | undefined>) {
    if (targetId && Object.prototype.hasOwnProperty.call(counts, targetId)) {
      counts[targetId] += 1;
    }
  }
  const maximumVotes = Math.max(
    0,
    ...(Object.values(counts) as number[]),
  );
  const leaderIds = maximumVotes > 0
    ? ids.filter((id) => counts[id] === maximumVotes)
    : [];
  return {
    counts,
    maximumVotes,
    leaderIds,
    tied: leaderIds.length > 1,
  };
}
