import { notFound } from "next/navigation";
import { SdkPreviewGameShell } from "./SdkPreviewGameShell";
import {
  normalizeGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import {
  loadSdkPreviewRuntimeDefinition,
} from "@/lib/sdk-preview-runtime-source";

export const dynamic = "force-dynamic";

export default async function SdkGamePage({ params }: { params: Promise<{ creatorSlug: string; gameId: string }> }) {
  const { creatorSlug, gameId } = await params;
  const game = await loadSdkPreviewRuntimeDefinition(creatorSlug, gameId);
  if (!game) notFound();
  return (
    <SdkPreviewGameShell
      backHref={`/sdk-preview/${creatorSlug}`}
      creatorSlug={creatorSlug}
      gameId={gameId}
      runtimeUrl={game.runtimeUrl}
      title={game.title}
      moduleProfile={normalizeGameSdkModuleProfile(game.modulePolicy)}
      settingDefinitions={game.settings}
    />
  );
}
