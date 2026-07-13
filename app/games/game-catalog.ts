import registry from "@/config/game-registry.json";

export type GameCatalogEntry = { id: string; title: string; status: string; href: string; players: string; time: string; summary: string; accent: string; private: boolean; stats: "account" | "local-disabled" };

export const games: GameCatalogEntry[] = registry.map((game) => ({
  id: game.id, title: game.title, status: game.status, href: game.href, players: game.players, time: game.time, summary: game.summary, accent: game.accent, private: game.private, stats: game.stats as GameCatalogEntry["stats"],
}));
