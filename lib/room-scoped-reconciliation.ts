export type RoomRevisionWatermarks = ReadonlyMap<string, number>;

/**
 * A response is usable only while the Room that started its request remains
 * active, and only when the response still names that same Room.
 */
export function isRoomScopedResponseCurrent(
  activeRoomCode: string | null | undefined,
  originRoomCode: string,
  responseRoomCode: string,
) {
  return activeRoomCode === originRoomCode && responseRoomCode === originRoomCode;
}

/** Same-Room revisions are monotonic; watermarks never cross Room identities. */
export function canAcceptRoomRevision(
  watermarks: RoomRevisionWatermarks,
  roomCode: string,
  revision: number,
) {
  const watermark = watermarks.get(roomCode);
  return watermark === undefined || revision > watermark;
}

export function recordRoomRevision(
  watermarks: Map<string, number>,
  roomCode: string,
  revision: number,
) {
  if (!canAcceptRoomRevision(watermarks, roomCode, revision)) return false;
  watermarks.set(roomCode, revision);
  return true;
}
