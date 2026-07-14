type PlayerAccountEmailOwners = {
  postgresLoginName: string | null;
  redisLoginName: string | null;
};

export function hasPlayerAccountEmailOwnerConflict(
  loginName: string,
  owners: PlayerAccountEmailOwners,
) {
  return [owners.postgresLoginName, owners.redisLoginName]
    .some((owner) => Boolean(owner) && owner !== loginName);
}
