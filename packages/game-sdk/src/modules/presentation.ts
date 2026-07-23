export type GameSdkParticipant = {
  id: string;
};

export function gameSdkPlayerSeat<TPlayer extends GameSdkParticipant>(
  players: readonly TPlayer[],
  playerId: string | null | undefined,
) {
  if (!playerId) return -1;
  return players.findIndex((player) => player.id === playerId);
}

export function gameSdkPlayerSeats<TPlayer extends GameSdkParticipant>(
  players: readonly TPlayer[],
  playerIds: readonly string[],
) {
  return playerIds
    .map((playerId) => gameSdkPlayerSeat(players, playerId))
    .filter((seat) => seat >= 0);
}
