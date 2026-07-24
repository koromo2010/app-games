import { notFound } from "next/navigation";
import { SdkPreviewGameShell } from "./SdkPreviewGameShell";
import {
  normalizeGameSdkModuleProfile,
  type GameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";

export const dynamic = "force-dynamic";
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

function sdkPortalBaseUrl() {
  return process.env.SDK_PORTAL_INTERNAL_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://sdk.game-fields.com" : "https://sdk-dev.game-fields.com");
}

export default async function SdkGamePage({ params }: { params: Promise<{ creatorSlug: string; gameId: string }> }) {
  const { creatorSlug, gameId } = await params;
  if (!SLUG_PATTERN.test(creatorSlug) || !GAME_PATTERN.test(gameId)) notFound();
  const response = await fetch(`${sdkPortalBaseUrl()}/api/preview-runtime/${creatorSlug}/${gameId}`, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("SDK game runtime is unavailable.");
  const game = await response.json() as {
    title: string;
    runtimeUrl: string;
    modulePolicy?: GameSdkModuleProfile;
  };
  return (
    <SdkPreviewGameShell
      backHref={`/sdk-preview/${creatorSlug}`}
      gameId={gameId}
      runtimeUrl={game.runtimeUrl}
      title={game.title}
      moduleProfile={normalizeGameSdkModuleProfile(game.modulePolicy)}
    />
  );
}
