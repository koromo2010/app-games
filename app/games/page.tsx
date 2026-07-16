import type { Metadata } from "next";
import { loadSiteSettings } from "@/lib/site-settings-store";
import { loadGameOperations } from "@/lib/game-operations-store";
import { GameLobby } from "./GameLobby";

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
  const [settings, gameOperations] = await Promise.all([loadSiteSettings(), loadGameOperations()]);
  return <GameLobby siteName={settings.siteName} gameOperations={gameOperations} />;
}
