export const onlineRoomCodePattern = /^[A-Z0-9]{4}$/;
export const onlineRoomPassphraseMaximumLength = 40;
export const onlineRoomListPageSize = 24;
export const onlineRoomPlayerLimits = {
  wordwolf: 20,
  tahoiya: 8,
  northernBranch: 4,
  hodoai: 50,
  kotobaSenpuku: 20,
  nigoichi: 6,
} as const;

/** Registry IDs mapped to their technical room limits. Keep this exhaustive for online games. */
export const onlineRoomPlayerLimitsByGameId = {
  "wordwolf": onlineRoomPlayerLimits.wordwolf,
  "tahoiya": onlineRoomPlayerLimits.tahoiya,
  "northern-branch": onlineRoomPlayerLimits.northernBranch,
  "hodoai": onlineRoomPlayerLimits.hodoai,
  "kotoba-senpuku": onlineRoomPlayerLimits.kotobaSenpuku,
  "nigoichi": onlineRoomPlayerLimits.nigoichi,
} as const;

export function normalizeOnlineRoomCode(value: unknown) {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase();
  return onlineRoomCodePattern.test(code) ? code : "";
}
