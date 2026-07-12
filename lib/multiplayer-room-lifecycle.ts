export const multiplayerRoomTtlSeconds = 6 * 60 * 60;

export function isMultiplayerRoomExpired(updatedAt: number, now = Date.now()) {
  return !Number.isFinite(updatedAt) || now - updatedAt > multiplayerRoomTtlSeconds * 1000;
}

export function multiplayerRoomExpiryArgs() {
  return ["EX", String(multiplayerRoomTtlSeconds)] as const;
}
