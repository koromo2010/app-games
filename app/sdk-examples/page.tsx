import type { Metadata } from "next";
import { GameLobby } from "@/app/games/GameLobby";
import type { GameCatalogEntry } from "@/app/games/game-catalog";
import { loadGameOperations } from "@/lib/game-operations-store";
import { loadSiteSettings } from "@/lib/site-settings-store";

export const metadata: Metadata = {
  title: "SDK公式サンプル",
  description: "Game Fieldsの共通UIとSDKの境界を確認できる公式サンプルです。",
};

const officialGames: GameCatalogEntry[] = [
  {
    id: "sdk-official-word-wolf",
    title: "ワードウルフ SDK",
    visual: "/game-visuals/wordwolf.webp",
    tags: ["対戦", "正体隠匿", "会話"],
    href: "/sdk-examples/word-wolf",
    players: "3人（検証用）",
    time: "5-15分",
    summary: "共通ルームとワードウルフ固有処理を分離した、Game Fields公式のSDK基準実装。",
    accent: "from-cyan-300 via-emerald-200 to-amber-200",
    private: false,
    stats: "local-disabled",
  },
];

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
