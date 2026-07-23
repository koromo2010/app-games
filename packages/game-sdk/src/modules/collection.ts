function distinctIds<TId extends string>(ids: readonly TId[]) {
  return [...new Set(ids)];
}

/** Returns the participant IDs that still owe the current phase an action. */
export function missingGameSdkParticipantIds<TId extends string>(
  participantIds: readonly TId[],
  isComplete: (participantId: TId) => boolean,
) {
  return distinctIds(participantIds).filter(
    (participantId) => !isComplete(participantId),
  );
}

/** Shared completion rule for simultaneous text, choice, vote and secret phases. */
export function allGameSdkParticipantsComplete<TId extends string>(
  participantIds: readonly TId[],
  isComplete: (participantId: TId) => boolean,
) {
  const ids = distinctIds(participantIds);
  return (
    ids.length > 0
    && missingGameSdkParticipantIds(ids, isComplete).length === 0
  );
}

/** Adds one immutable participant submission after enforcing shared actor rules. */
export function recordGameSdkParticipantValue<TId extends string, TValue>(
  values: Readonly<Partial<Record<TId, TValue>>>,
  participantId: TId,
  value: TValue,
  options: {
    participantIds: readonly TId[];
    allowReplace?: boolean;
    errors?: {
      participant?: string;
      alreadySubmitted?: string;
    };
  },
) {
  if (!distinctIds(options.participantIds).includes(participantId)) {
    throw new Error(options.errors?.participant ?? "PARTICIPANT_REQUIRED");
  }
  if (
    !options.allowReplace
    && Object.prototype.hasOwnProperty.call(values, participantId)
  ) {
    throw new Error(
      options.errors?.alreadySubmitted ?? "ALREADY_SUBMITTED",
    );
  }
  return {
    ...values,
    [participantId]: value,
  } as Partial<Record<TId, TValue>>;
}
