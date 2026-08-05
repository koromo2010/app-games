import { notFound, redirect } from "next/navigation";
import {
  getCreatorGameModuleProfile,
  listAccountGames,
  listOwnedGamePackageRevisions,
  normalizeInstanceSlug,
  resolveCreatorOwner,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import {
  createSdkPreviewAccountLinkCode,
  getSdkAccountSession,
} from "@/lib/account-session";
import { getCreatorModuleCustomizationAccess } from "@/lib/module-customization-access";
import { resolveSdkSession } from "@/lib/sdk-owner-classification";
import {
  logSdkOwnerLookupFailure,
  logSdkSessionLookupFailure,
} from "@/lib/sdk-owner-observability";
import { GameModuleReview } from "./GameModuleReview";
import { CreatorAccountReconnect } from "../../../CreatorAccountReconnect";
import { CreatorOwnershipIssue } from "../../../CreatorOwnershipIssue";
import { CreatorPreviewFrame } from "../../../CreatorPreviewFrame";
import { GamePackageRevisionExport } from "./GamePackageRevisionExport";

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
  let session;
  try {
    session = await resolveSdkSession(getSdkAccountSession);
  } catch (error) {
    logSdkSessionLookupFailure(error);
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  if (session.status === "session_missing") {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(requestedReturnPath)}`,
    );
  }

  const account = session.account;
  let owner;
  try {
    owner = await resolveCreatorOwner(instanceId, account.playerId);
  } catch {
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  if (owner.status === "owner_mismatch") {
    return <CreatorAccountReconnect returnTo={requestedReturnPath} />;
  }
  if (owner.status !== "authorized") {
    return <CreatorOwnershipIssue kind="record_inconsistency" />;
  }

  let games;
  try {
    games = await listAccountGames(account.playerId);
  } catch (error) {
    logSdkOwnerLookupFailure(error);
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  const currentGame = games.find((game) => (
    game.creatorSlug === instanceId && game.gameId === gameId
  ));
  const effectiveRevision = requestedRevision
    || currentGame?.packageCandidateRevision
    || "";

  let moduleProfile;
  try {
    moduleProfile = await getCreatorGameModuleProfile(
      instanceId,
      gameId,
    );
  } catch (error) {
    logSdkOwnerLookupFailure(error);
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  let customizationAccess;
  try {
    customizationAccess = await getCreatorModuleCustomizationAccess({
      creatorSlug: instanceId,
      ownerPlayerId: account.playerId,
    });
  } catch (error) {
    logSdkOwnerLookupFailure(error);
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  let packageRevisions;
  try {
    packageRevisions = await listOwnedGamePackageRevisions({
      ownerPlayerId: account.playerId,
      creatorSlug: instanceId,
      gameId,
    });
  } catch (error) {
    logSdkOwnerLookupFailure(error);
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }

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
    <CreatorPreviewFrame
      creatorSlug={instanceId}
      previewUrl={previewUrl}
      previewOrigin={new URL(appBaseUrl).origin}
    />
    <GamePackageRevisionExport instanceId={instanceId} gameId={gameId} revisions={packageRevisions} />
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
