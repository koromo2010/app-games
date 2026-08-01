import { notFound, redirect } from "next/navigation";
import {
  authenticateCreatorOwner,
  getCreatorGameModuleProfile,
  listAccountGames,
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
const REVISION_PATTERN = /^[a-f0-9]{40}$/;

export default async function CreatorGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ instanceId: string; gameId: string }>;
  searchParams: Promise<{ revision?: string }>;
}) {
  const raw = await params;
  const query = await searchParams;
  const instanceId = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  const requestedRevision = query.revision?.trim() ?? "";
  if (
    validateInstanceSlug(instanceId)
    || !GAME_PATTERN.test(gameId)
    || (requestedRevision && !REVISION_PATTERN.test(requestedRevision))
  ) notFound();

  const requestedReturnPath = `/${instanceId}/games/${gameId}${
    requestedRevision ? `?revision=${encodeURIComponent(requestedRevision)}` : ""
  }`;
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(requestedReturnPath)}`,
    );
  }

  const owner = await authenticateCreatorOwner(
    instanceId,
    account.playerId,
  ).catch(() => null);
  if (!owner) notFound();

  const games = await listAccountGames(account.playerId).catch(() => []);
  const currentGame = games.find((game) => (
    game.creatorSlug === instanceId && game.gameId === gameId
  ));
  const effectiveRevision = requestedRevision
    || currentGame?.packageCandidateRevision
    || "";

  const moduleProfile = await getCreatorGameModuleProfile(
    instanceId,
    gameId,
  ).catch(() => null);
  const customizationAccess = await getCreatorModuleCustomizationAccess({
    creatorSlug: instanceId,
    ownerPlayerId: account.playerId,
  }).catch(() => null);

  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
  const linkCode = createSdkPreviewAccountLinkCode({
    playerId: account.playerId,
    playerName: account.playerName,
    audience: new URL(appBaseUrl).origin,
    creatorSlug: instanceId,
  });
  const previewPath = `/sdk-preview/${instanceId}/games/${gameId}${
    effectiveRevision ? `?revision=${encodeURIComponent(effectiveRevision)}` : ""
  }`;
  const previewUrl = `${appBaseUrl}${previewPath}#${new URLSearchParams({
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
