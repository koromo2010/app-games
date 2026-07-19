import registry from "@/config/game-registry.json";

export type GameTag = "対戦" | "協力" | "チーム戦" | "正体隠匿" | "会話" | "ブラフ" | "作文" | "戦略" | "連想" | "推理" | "お絵描き";

export type GameCatalogEntry = { id: string; title: string; englishTitle?: string; icon: string; tags: GameTag[]; href: string; players: string; time: string; summary: string; accent: string; private: boolean; stats: "account" | "local-disabled" };

export const games: GameCatalogEntry[] = registry.map((game) => ({
  id: game.id, title: game.title, englishTitle: "englishTitle" in game ? game.englishTitle : undefined, icon: `/game-icons/${game.id}.svg`, tags: game.tags as GameTag[], href: game.href, players: game.players, time: game.time, summary: game.summary, accent: game.accent, private: game.private, stats: game.stats as GameCatalogEntry["stats"],
}));
