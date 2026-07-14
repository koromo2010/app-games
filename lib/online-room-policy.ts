export const onlineRoomCodePattern = /^[A-Z0-9]{4}$/;
export const onlineRoomPassphraseMaximumLength = 40;
export const onlineRoomPlayerLimits = {
  wordwolf: 20,
  tahoiya: 8,
  northernBranch: 4,
  hodoai: 50,
  kotobaSenpuku: 20,
} as const;

export function normalizeOnlineRoomCode(value: unknown) {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase();
  return onlineRoomCodePattern.test(code) ? code : "";
}
