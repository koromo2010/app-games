export type GamePublication = "public" | "private" | "hidden";

export function normalizeGamePublication(value: unknown, fallback: GamePublication): GamePublication {
  return value === "public" || value === "private" || value === "hidden" ? value : fallback;
}
