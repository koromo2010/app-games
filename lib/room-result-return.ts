type RoomPhase = {
  phase: string;
};

type RoomPlayers = {
  players: Array<{ id: string }>;
};

export function shouldHoldRoomResultTransition(
  currentRoom: RoomPhase | null,
  incomingRoom: RoomPhase,
  resultPhase: string,
) {
  return currentRoom?.phase === resultPhase && incomingRoom.phase === "lobby";
}

export function shouldKeepRoomResultAfterDissolve(
  currentRoom: RoomPhase | null,
  resultPhase: string,
) {
  return currentRoom?.phase === resultPhase;
}

export function roomHasReturningPlayer(room: RoomPlayers, playerId: string) {
  return Boolean(playerId) && room.players.some((player) => player.id === playerId);
}
