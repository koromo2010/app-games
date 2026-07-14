export const gameAdSurfaces = ["catalog", "game-entry", "room-lobby", "result"] as const;

export type GameAdSurface = typeof gameAdSurfaces[number];
export type GameAdsMode = "off" | "preview" | "live";

export function normalizeGameAdsMode(value: unknown): GameAdsMode {
  return value === "preview" || value === "live" ? value : "off";
}

export function gameAdSlotId(gameId: string, surface: GameAdSurface) {
  const normalizedGameId = gameId.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "unknown";
  return `${normalizedGameId}:${surface}`;
}

export function canRenderGameAd(mode: GameAdsMode, surface: GameAdSurface | null | undefined, disabled = false) {
  return mode !== "off" && Boolean(surface) && !disabled;
}
