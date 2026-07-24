import type { Metadata } from "next";
import { loadSiteSettings } from "@/lib/site-settings-store";
import { loadGameOperations } from "@/lib/game-operations-store";
import { loadGameDurationEstimates } from "@/lib/game-duration-store";
import { loadApprovedGameSdkCatalog } from "@/lib/game-sdk-runtime-catalog";
import { GameLobby } from "./GameLobby";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSiteSettings();
  return {
    title: { absolute: settings.searchTitle },
    description: settings.searchDescription,
    alternates: { canonical: "/games" },
    openGraph: { title: settings.searchTitle, description: settings.searchDescription, url: "/games" },
    twitter: { title: settings.searchTitle, description: settings.searchDescription },
  };
}

export default async function GameLobbyPage() {
  const [settings, gameOperations, durationEstimates, sdkGames] = await Promise.all([
    loadSiteSettings(),
    loadGameOperations(),
    loadGameDurationEstimates(),
    loadApprovedGameSdkCatalog().catch(() => []),
  ]);
  const sdkOperations = sdkGames.map((game) => ({
    gameId: game.id,
    publication: "public" as const,
    maintenance: false,
    message: "",
    updatedAt: null,
  }));
  return (
    <GameLobby
      siteName={settings.siteName}
      gameOperations={[...gameOperations, ...sdkOperations]}
      durationEstimates={durationEstimates}
      additionalGames={sdkGames}
    />
  );
}
