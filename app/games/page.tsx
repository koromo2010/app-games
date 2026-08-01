import type { Metadata } from "next";
import { loadSiteSettings } from "@/lib/site-settings-store";
import { GameLobbyRoute } from "./GameLobbyRoute";

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

export default function GameLobbyPage() {
  return <GameLobbyRoute />;
}
