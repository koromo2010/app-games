import {
  gamesForLocale,
  type LocalizedGameCatalogEntry,
} from "@/app/games/game-catalog";
import { loadApprovedGameSdkCatalog } from "@/lib/game-sdk-runtime-catalog";
import {
  loadGameDisplayMetadataSnapshot,
  type GameDisplayCatalogSource,
} from "@/lib/game-display-metadata";

function displaySources(
  entries: readonly LocalizedGameCatalogEntry[],
): GameDisplayCatalogSource[] {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    href: entry.href,
  }));
}

export async function loadPublicGameDisplayMetadata() {
  return loadGameDisplayMetadataSnapshot({
    builtIn: {
      ja: displaySources(gamesForLocale("ja")),
      en: displaySources(gamesForLocale("en")),
    },
    loadSdkCatalog: async () => {
      const games = await loadApprovedGameSdkCatalog();
      return {
        ja: games.map((game) => ({
          id: game.id,
          title: game.title,
          href: game.href,
        })),
        en: games.map((game) => ({
          id: game.id,
          title: game.englishTitle?.trim() || game.title,
          href: game.href,
        })),
      };
    },
  });
}
