function shuffledWith<T>(items: readonly T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

/** Assigns exact role counts and fills every remaining player with a fallback. */
export function assignGameSdkRoles<
  TId extends string,
  TAssignedRole extends string,
  TFallbackRole extends string,
>(
  participantIds: readonly TId[],
  roleCounts: Readonly<Partial<Record<TAssignedRole, number>>>,
  fallbackRole: TFallbackRole,
  random: () => number = Math.random,
) {
  const ids = shuffledWith([...new Set(participantIds)], random);
  type TRole = TAssignedRole | TFallbackRole;
  const assignments = {} as Record<TId, TRole>;
  let cursor = 0;
  for (
    const [role, rawCount]
    of Object.entries(roleCounts) as Array<
      [TAssignedRole, number | undefined]
    >
  ) {
    const count = Math.max(0, Math.trunc(rawCount ?? 0));
    for (
      let index = 0;
      index < count && cursor < ids.length;
      index += 1
    ) {
      assignments[ids[cursor]!] = role;
      cursor += 1;
    }
  }
  while (cursor < ids.length) {
    assignments[ids[cursor]!] = fallbackRole;
    cursor += 1;
  }
  return assignments;
}

/** Produces a shuffled participant order and balanced teams. */
export function distributeGameSdkBalancedTeams<
  TId extends string,
  TTeam extends string,
>(
  participantIds: readonly TId[],
  teamIds: readonly TTeam[],
  random: () => number = Math.random,
) {
  const teams = [...new Set(teamIds)];
  if (teams.length === 0) throw new Error("TEAM_REQUIRED");
  const ids = shuffledWith([...new Set(participantIds)], random);
  const firstTeamIndex = Math.floor(random() * teams.length) % teams.length;
  const assignments = Object.fromEntries(ids.map((id, index) => [
    id,
    teams[(firstTeamIndex + index) % teams.length]!,
  ])) as Record<TId, TTeam>;
  return {
    participantIds: ids,
    assignments,
  };
}

export function assignGameSdkBalancedTeams<
  TId extends string,
  TTeam extends string,
>(
  participantIds: readonly TId[],
  teamIds: readonly TTeam[],
  random: () => number = Math.random,
) {
  return distributeGameSdkBalancedTeams(
    participantIds,
    teamIds,
    random,
  ).assignments;
}
