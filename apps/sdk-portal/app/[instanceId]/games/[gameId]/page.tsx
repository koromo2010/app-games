import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import {
  authenticateCreatorOwner,
  getCreatorGameModuleProfile,
  normalizeInstanceSlug,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import {
  createSdkPreviewAccountLinkCode,
  getSdkAccountSession,
} from "@/lib/account-session";
import { getCreatorModuleCustomizationAccess } from "@/lib/module-customization-access";
import { GameModuleReview } from "./GameModuleReview";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;

export default async function CreatorGamePage({ params }: { params: Promise<{ instanceId: string; gameId: string }> }) {
  const raw = await params;
  const instanceId = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  if (validateInstanceSlug(instanceId) || !GAME_PATTERN.test(gameId)) notFound();
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(`/${instanceId}/games/${gameId}`)}`,
    );
  }
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
  const linkCode = createSdkPreviewAccountLinkCode({
    playerId: account.playerId,
    playerName: account.playerName,
    audience: new URL(appBaseUrl).origin,
    creatorSlug: instanceId,
  });
  const previewUrl = `${appBaseUrl}/sdk-preview/${instanceId}/games/${gameId}#${new URLSearchParams({
    sdkPreviewLink: linkCode,
  }).toString()}`;
  return <main className="platform-preview-shell">
    <iframe className="platform-preview-frame" src={previewUrl} title={`${gameId}のGame Fields開発環境`} allow="fullscreen" />
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
