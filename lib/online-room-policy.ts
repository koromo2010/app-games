export const onlineRoomCodePattern = /^[A-Z0-9]{4}$/;
export const onlineRoomPassphraseMaximumLength = 40;

export function normalizeOnlineRoomCode(value: unknown) {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase();
  return onlineRoomCodePattern.test(code) ? code : "";
}
