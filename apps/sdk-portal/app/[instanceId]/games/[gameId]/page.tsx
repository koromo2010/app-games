import { notFound } from "next/navigation";
import {
  authenticateCreatorOwner,
  getCreatorGameModuleProfile,
  normalizeInstanceSlug,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import { getSdkAccountSession } from "@/lib/account-session";
import { getCreatorModuleCustomizationAccess } from "@/lib/module-customization-access";
import { GameModuleReview } from "./GameModuleReview";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export default async function CreatorGamePage({ params }: { params: Promise<{ instanceId: string; gameId: string }> }) {
  const raw = await params;
  const instanceId = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  if (validateInstanceSlug(instanceId) || !GAME_PATTERN.test(gameId)) notFound();
  const account = await getSdkAccountSession().catch(() => null);
  const owner = account
    ? await authenticateCreatorOwner(instanceId, account.playerId).catch(
      () => null,
    )
    : null;
  const moduleProfile = owner
    ? await getCreatorGameModuleProfile(instanceId, gameId).catch(
      () => null,
    )
    : null;
  const customizationAccess = owner && account
    ? await getCreatorModuleCustomizationAccess({
      creatorSlug: instanceId,
      ownerPlayerId: account.playerId,
    })
    : null;
  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
  return <main className="platform-preview-shell">
    <iframe className="platform-preview-frame" src={`${appBaseUrl}/sdk-preview/${instanceId}/games/${gameId}`} title={`${gameId}のGame Fields開発環境`} allow="fullscreen" />
    {moduleProfile && (
      <GameModuleReview
        instanceId={instanceId}
        gameId={gameId}
        initialProfile={moduleProfile}
        canCustomize={customizationAccess?.allowed === true}
      />
    )}
  </main>;
}
