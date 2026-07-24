import { notFound } from "next/navigation";
import { SdkPreviewGameShell } from "./SdkPreviewGameShell";
import { SdkPackageGameShell } from "./SdkPackageGameShell";
import {
  normalizeGameSdkModuleProfile,
} from "@game-fields/game-sdk/modules";
import {
  loadSdkPreviewRuntimeDefinition,
} from "@/lib/sdk-preview-runtime-source";
import { SdkPreviewSessionGate } from "@/app/sdk-preview/SdkPreviewSessionGate";
import { sdkPreviewPackageRuntimeId } from "@/lib/sdk-preview-package-runtime";

export const dynamic = "force-dynamic";

export default async function SdkGamePage({ params }: { params: Promise<{ creatorSlug: string; gameId: string }> }) {
  const { creatorSlug, gameId } = await params;
  const game = await loadSdkPreviewRuntimeDefinition(creatorSlug, gameId);
  if (!game) notFound();
  const portalBaseUrl = process.env.SDK_PORTAL_INTERNAL_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main"
      ? "https://sdk.game-fields.com"
      : "https://sdk-dev.game-fields.com");
  return (
    <SdkPreviewSessionGate
      creatorSlug={creatorSlug}
      portalHref={`${portalBaseUrl}/${creatorSlug}/games/${gameId}`}
    >
      {game.runtimeKind === "package" && game.revision && game.manifest ? (
        <SdkPackageGameShell
          backHref={`/sdk-preview/${creatorSlug}`}
          creatorSlug={creatorSlug}
          gameId={gameId}
          runtimeId={sdkPreviewPackageRuntimeId(
            creatorSlug,
            gameId,
            game.revision,
          )}
          runtimeUrl={game.runtimeUrl}
          title={game.title}
          settingDefinitions={game.settings}
          rules={(game.manifest.rules ?? []).map((rule) => rule.ja)}
        />
      ) : (
        <SdkPreviewGameShell
          backHref={`/sdk-preview/${creatorSlug}`}
          creatorSlug={creatorSlug}
          gameId={gameId}
          runtimeUrl={game.runtimeUrl}
          title={game.title}
          moduleProfile={normalizeGameSdkModuleProfile(game.modulePolicy)}
          settingDefinitions={game.settings}
        />
      )}
    </SdkPreviewSessionGate>
  );
}
