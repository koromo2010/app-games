import { notFound } from "next/navigation";
import { approvedGameSdkRegistration } from "@/lib/game-sdk-server-registry";
import { ApprovedSdkGameShell } from "./ApprovedSdkGameShell";
import { GameSdkFrame } from "@/app/components/GameSdkFrame";
import { PlayerAuthGate } from "@/app/components/PlayerAuthGate";
import { loadApprovedGameSdkRuntimeRegistration } from "@/lib/game-sdk-runtime-catalog";
import { getAuthenticatedPlayer } from "@/lib/player-auth";

export const dynamic = "force-dynamic";

export default async function ApprovedSdkGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const registration = approvedGameSdkRegistration(gameId)
    ?? await loadApprovedGameSdkRuntimeRegistration(gameId);
  if (!registration) notFound();
  if (!(await getAuthenticatedPlayer())) {
    return <PlayerAuthGate title={registration.title} />;
  }
  if (
    registration.clientKind === "iframe-package"
    && registration.clientRuntimeUrl
    && registration.revision
  ) {
    return (
      <GameSdkFrame
        backHref="/games"
        endpoint={`/api/game-sdk/${registration.id}/rooms`}
        gameId={registration.id}
        runtimeId={registration.id}
        runtimeUrl={`/api/game-sdk/${encodeURIComponent(
          registration.id,
        )}/client-runtime?revision=${encodeURIComponent(
          registration.revision,
        )}`}
        title={registration.title}
        settingDefinitions={registration.settings}
        rules={registration.rules}
        moduleProfile={registration.moduleProfile}
        supportsReplay={registration.supportsReplay}
        supportsSpectators={registration.supportsSpectators}
        usesLlm={registration.usesLlm}
      />
    );
  }
  if (registration.clientKind !== "wordwolf") notFound();
  return (
    <ApprovedSdkGameShell
      gameId={registration.id}
      title={registration.title}
      settingDefinitions={registration.settings}
      rules={registration.rules}
    />
  );
}
