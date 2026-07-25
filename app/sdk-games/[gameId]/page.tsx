import { notFound } from "next/navigation";
import { approvedGameSdkRegistration } from "@/lib/game-sdk-server-registry";
import { ApprovedSdkGameShell } from "./ApprovedSdkGameShell";
import { GameSdkFrame } from "@/app/components/GameSdkFrame";
import { loadApprovedGameSdkRuntimeRegistration } from "@/lib/game-sdk-runtime-catalog";

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
  if (registration.clientKind === "iframe-package" && registration.clientRuntimeUrl) {
    return (
      <GameSdkFrame
        backHref="/games"
        endpoint={`/api/game-sdk/${registration.id}/rooms`}
        gameId={registration.id}
        runtimeId={registration.id}
        runtimeUrl={registration.clientRuntimeUrl}
        title={registration.title}
        settingDefinitions={registration.settings}
        rules={registration.rules}
        moduleProfile={registration.moduleProfile}
        supportsReplay={registration.supportsReplay}
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
