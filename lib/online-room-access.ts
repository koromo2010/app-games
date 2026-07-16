type OnlineRoomPlayer = { id: string; isDummy?: boolean };

export function onlineRoomActorAccess(
  hostId: string,
  players: OnlineRoomPlayer[],
  actorId: string,
  options: { excludeDummy?: boolean } = {},
) {
  return {
    isHost: actorId === hostId,
    isMember: players.some((player) => player.id === actorId && (!options.excludeDummy || !player.isDummy)),
  };
}

export function canLeaveOnlineRoomLobby(access: { isHost: boolean; isMember: boolean }, phase: string) {
  return access.isMember && !access.isHost && phase === "lobby";
}
