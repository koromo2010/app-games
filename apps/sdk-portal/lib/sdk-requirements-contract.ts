const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export function normalizeRequirementsGameId(value: unknown) {
  const gameId = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!GAME_PATTERN.test(gameId)) throw new Error("GAME_SDK_GAME_ID_INVALID");
  return gameId;
}

