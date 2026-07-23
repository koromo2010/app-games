type OnlineRoomPlayer = { id: string; isDummy?: boolean };

export function isOnlineRoomDebugPlayer(player: OnlineRoomPlayer) {
  return player.isDummy === true || player.id.startsWith("dummy-");
}

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

export function canRemoveOnlineRoomDebugPlayer(input: {
  actorId: string;
  debugMode: boolean;
  hostId: string;
  phase: string;
  players: OnlineRoomPlayer[];
  targetPlayerId: string;
}) {
  return input.actorId === input.hostId
    && input.debugMode
    && input.phase === "lobby"
    && input.targetPlayerId !== input.hostId
    && input.players.some((player) => player.id === input.targetPlayerId && isOnlineRoomDebugPlayer(player));
}
