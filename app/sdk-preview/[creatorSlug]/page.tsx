import { notFound } from "next/navigation";
import { loadGameOperations } from "@/lib/game-operations-store";
import { loadSiteSettings } from "@/lib/site-settings-store";
import { GameLobby } from "@/app/games/GameLobby";
import { sdkGamesForCatalog, type SdkGameDescriptor } from "@/app/games/sdk-game-catalog";
import { SdkPreviewSessionGate } from "@/app/sdk-preview/SdkPreviewSessionGate";
import { sdkPortalInternalBaseUrl } from "@/lib/sdk-dashboard-navigation";

export const dynamic = "force-dynamic";
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;

async function loadSdkGames(creatorSlug: string) {
  const response = await fetch(`${sdkPortalInternalBaseUrl()}/api/preview-catalog/${creatorSlug}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("SDK preview catalog is unavailable.");
  const payload = await response.json() as { games?: SdkGameDescriptor[] };
  return Array.isArray(payload.games) ? payload.games : [];
}

export default async function SdkCreatorLobbyPage({ params }: { params: Promise<{ creatorSlug: string }> }) {
  const { creatorSlug } = await params;
  if (!SLUG_PATTERN.test(creatorSlug)) notFound();
  const [settings, operations, sdkGames] = await Promise.all([
    loadSiteSettings(),
    loadGameOperations(),
    loadSdkGames(creatorSlug),
  ]);
  if (!sdkGames) notFound();
  const creatorGames = sdkGamesForCatalog(creatorSlug, sdkGames);
  const creatorOperations = creatorGames.map((game) => ({
    gameId: game.id,
    publication: "public" as const,
    maintenance: false,
    message: "",
    updatedAt: null,
  }));
  return (
    <SdkPreviewSessionGate
      creatorSlug={creatorSlug}
      portalHref={`${sdkPortalInternalBaseUrl()}/${creatorSlug}`}
    >
      <GameLobby
        siteName={settings.siteName}
        gameOperations={[...operations, ...creatorOperations]}
        additionalGames={creatorGames}
        includeBuiltInGames={false}
        sdkCreatorSlug={creatorSlug}
        sdkDashboardHref={`${sdkPortalInternalBaseUrl()}/dashboard`}
      />
    </SdkPreviewSessionGate>
  );
}
