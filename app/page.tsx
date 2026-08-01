import type { Metadata } from "next";
import { loadSiteSettings } from "@/lib/site-settings-store";
import { GameLobbyRoute } from "./games/GameLobbyRoute";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSiteSettings();
  return {
    title: { absolute: settings.searchTitle },
    description: settings.searchDescription,
    alternates: { canonical: "/" },
    openGraph: { title: settings.searchTitle, description: settings.searchDescription, url: "/" },
    twitter: { title: settings.searchTitle, description: settings.searchDescription },
  };
}

export default function HomePage() {
  return <GameLobbyRoute />;
}
