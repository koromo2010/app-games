import registry from "@/config/game-registry.json";
import { normalizeAppLocale, type AppLocale } from "@/lib/app-locale";

export type GameTag = "対戦" | "協力" | "チーム戦" | "正体隠匿" | "会話" | "ブラフ" | "作文" | "戦略" | "連想" | "推理" | "お絵描き";

export type GameCatalogEntry = { id: string; title: string; englishTitle?: string; visual: string; tags: GameTag[]; href: string; players: string; time: string; timeSampleCount?: number; summary: string; accent: string; private: boolean; stats: "account" | "local-disabled" };

export const games: GameCatalogEntry[] = registry.map((game) => ({
  id: game.id, title: game.title, englishTitle: "englishTitle" in game ? game.englishTitle : undefined, visual: `/game-visuals/${game.id}.webp`, tags: game.tags as GameTag[], href: game.href, players: game.players, time: game.time, summary: game.summary, accent: game.accent, private: game.private, stats: game.stats as GameCatalogEntry["stats"],
}));

const englishTags: Record<GameTag, string> = {
  "対戦": "Competitive",
  "協力": "Co-op",
  "チーム戦": "Teams",
  "正体隠匿": "Hidden roles",
  "会話": "Conversation",
  "ブラフ": "Bluffing",
  "作文": "Writing",
  "戦略": "Strategy",
  "連想": "Association",
  "推理": "Deduction",
  "お絵描き": "Drawing",
};

const englishCatalog: Record<string, Pick<GameCatalogEntry, "title" | "players" | "time" | "summary">> = {
  wordwolf: { title: "Word Wolf", players: "3–20", time: "5–15 min", summary: "Discuss subtly different topics, identify the minority wolf by vote, then give the caught wolf one final chance to guess the villagers’ topic." },
  tahoiya: { title: "Tahoiya", players: "3–8", time: "10–20 min", summary: "Write convincing fake dictionary definitions for an unfamiliar word, mix them with the real one, and bluff your way through the vote." },
  "northern-branch": { title: "Northern Branch", players: "2–4", time: "20–40 min", summary: "Gather resources, produce and trade goods, and use buildings and brownies to become the first merchant company to reach 10 victory points." },
  hodoai: { title: "Word Scale", players: "2+", time: "10–20 min", summary: "Give clues for secret number cards and work together to arrange every card from smallest to largest." },
  "kotoba-senpuku": { title: "Word Sonar", players: "2+", time: "10–25 min", summary: "Probe one Japanese character each turn, expose your opponents’ secret words, and keep your own word hidden to the end." },
  nigoichi: { title: "Word Out", players: "2–6", time: "10–20 min", summary: "Use word associations to identify the one unmatched word. Increase the number of cards per player for a tougher game." },
  "code-intercept": { title: "Code Intercept", players: "4–12", time: "15–30 min", summary: "Transmit codes using clues that guide your teammates without revealing the pattern to the opposing team." },
  canvas: { title: "Canvas", players: "1–12 (prototype)", time: "Open-ended", summary: "A shared drawing space with a three-day lobby board, collaborative canvases, and optional shared or per-player layers." },
  daifugo: { title: "Daifugo", players: "3–6 (CPU practice available)", time: "5–15 min", summary: "Play the same number of stronger cards than the table and be the first to empty your hand. Supports online rooms and CPU practice." },
};

export type LocalizedGameCatalogEntry = Omit<GameCatalogEntry, "tags"> & { tags: string[] };

export function gamesForLocale(localeValue: unknown): LocalizedGameCatalogEntry[] {
  const locale: AppLocale = normalizeAppLocale(localeValue);
  if (locale === "ja") return games;
  return games.map((game) => ({
    ...game,
    ...(englishCatalog[game.id] ?? {}),
    tags: game.tags.map((tag) => englishTags[tag]),
  }));
}
