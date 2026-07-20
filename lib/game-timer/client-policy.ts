type TimeoutClaimDelayOptions = {
  playerId: string;
  hostId: string;
  playerIds: string[];
};

/** Lets the host advance first, while keeping ordered fallbacks if the host goes offline. */
export function clientTimeoutClaimDelayMs({ playerId, hostId, playerIds }: TimeoutClaimDelayOptions) {
  if (!playerId || playerId === hostId) return 0;
  const fallbackIds = [...new Set(playerIds.filter((id) => id && id !== hostId))];
  const fallbackIndex = Math.max(0, fallbackIds.indexOf(playerId));
  return Math.min(6_500, 3_500 + fallbackIndex * 750);
}
