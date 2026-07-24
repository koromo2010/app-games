import { notFound } from "next/navigation";
import { approvedGameSdkRegistration } from "@/lib/game-sdk-server-registry";
import { ApprovedSdkGameShell } from "./ApprovedSdkGameShell";

export const dynamic = "force-dynamic";

export default async function ApprovedSdkGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  const registration = approvedGameSdkRegistration(gameId);
  if (!registration) notFound();
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
