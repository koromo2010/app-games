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
  const sdkGames = await loadApprovedGameSdkCatalog().catch(() => []);
  const [settings, gameOperations, durationEstimates] = await Promise.all([
    loadSiteSettings(),
    loadGameOperations({}, sdkGames),
    loadGameDurationEstimates(),
  ]);
  return (
    <GameLobby
      siteName={settings.siteName}
      gameOperations={gameOperations}
      durationEstimates={durationEstimates}
      additionalGames={sdkGames}
    />
  );
}
