type TimeoutClaimDelayOptions = {
  playerId: string;
  hostId?: string;
  ownerId?: string;
  playerIds: string[];
};

/** Lets the timer owner advance first, while keeping ordered fallbacks if it goes offline. */
export function clientTimeoutClaimDelayMs({
  playerId,
  hostId,
  ownerId,
  playerIds,
}: TimeoutClaimDelayOptions) {
  const primaryId = ownerId || hostId || playerIds[0] || "";
  if (!playerId || playerId === primaryId) return 0;
  const fallbackIds = [...new Set(
    playerIds.filter((id) => id && id !== primaryId),
  )];
  const fallbackIndex = Math.max(0, fallbackIds.indexOf(playerId));
  return Math.min(6_500, 3_500 + fallbackIndex * 750);
}
