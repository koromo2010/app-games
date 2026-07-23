import type { Metadata } from "next";
import { GameLobby } from "@/app/games/GameLobby";
import { games, type GameCatalogEntry } from "@/app/games/game-catalog";
import { loadGameOperations } from "@/lib/game-operations-store";
import { loadSiteSettings } from "@/lib/site-settings-store";

export const metadata: Metadata = {
  title: "SDK公式サンプル",
  description: "Game Fieldsの共通UIとSDKの境界を確認できる公式サンプルです。",
};

const canonicalWordWolf = games.find((game) => game.id === "wordwolf");
if (!canonicalWordWolf) throw new Error("WORDWOLF_CATALOG_MISSING");

const officialGames: GameCatalogEntry[] = [{
  ...canonicalWordWolf,
  id: "sdk-official-word-wolf",
  href: "/sdk-examples/word-wolf",
  stats: "local-disabled",
}];

export default async function SdkExamplesPage() {
  const [settings, gameOperations] = await Promise.all([
    loadSiteSettings(),
    loadGameOperations(),
  ]);
  const officialGameOperations = [
    ...gameOperations,
    {
      gameId: "sdk-official-word-wolf",
      publication: "public" as const,
      maintenance: false,
      message: "",
      updatedAt: null,
    },
  ];

  return (
    <GameLobby
      siteName={`${settings.siteName} · SDK公式サンプル`}
      gameOperations={officialGameOperations}
      additionalGames={officialGames}
      includeBuiltInGames={false}
    />
  );
}
