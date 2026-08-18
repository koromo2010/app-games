import Link from "next/link";
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
import { AccountMenu } from "../../../account-menu";
import {
  creatorEnvironmentPath,
  creatorGameFormalRoomPath,
  creatorGamePreviewPath,
} from "@/lib/creator-game-route-contract";
import {
  creatorGameModuleAuthoringSummary,
  getCreatorGameModuleAuthoringState,
} from "@/lib/module-authoring-store";
import { sdkPortalReleaseProfile } from "@/lib/sdk-release-profile";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;

export default async function CreatorGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ instanceId: string; gameId: string }>;
  searchParams: Promise<{ revision?: string; view?: string }>;
}) {
  const raw = await params;
  const query = await searchParams;
  const instanceId = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  const requestedRevision = query.revision?.trim() ?? "";
  const requestedView = query.view?.trim() ?? "";
  const moduleView = requestedView === "modules";
  const previewView = requestedView === "preview";
  if (
    validateInstanceSlug(instanceId)
    || !GAME_PATTERN.test(gameId)
    || (requestedRevision && !REVISION_PATTERN.test(requestedRevision))
    || (requestedView && !moduleView && !previewView)
    || (moduleView && Boolean(requestedRevision))
    || (previewView && !requestedRevision)
  ) notFound();

  const requestedReturnPath = moduleView
    ? `/${instanceId}/games/${gameId}?view=modules`
    : previewView
      ? creatorGamePreviewPath({ creatorSlug: instanceId, gameId, revision: requestedRevision })
      : `/${instanceId}/games/${gameId}${
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
  if (!currentGame) notFound();
  const effectiveRevision = requestedRevision
    || currentGame.packageCandidateRevision
    || "";

  if (!moduleView && !previewView && !requestedRevision && effectiveRevision) {
    redirect(creatorGameFormalRoomPath({
      creatorSlug: instanceId,
      gameId,
      revision: effectiveRevision,
    }));
  }

  if (moduleView) {
    let moduleProfile;
    let customizationAccess;
    let packageRevisions;
    let moduleContract;
    try {
      [moduleProfile, customizationAccess, packageRevisions, moduleContract] = await Promise.all([
        getCreatorGameModuleProfile(instanceId, gameId),
        getCreatorModuleCustomizationAccess({
          creatorSlug: instanceId,
          ownerPlayerId: account.playerId,
        }),
        listOwnedGamePackageRevisions({
          ownerPlayerId: account.playerId,
          creatorSlug: instanceId,
          gameId,
        }),
        getCreatorGameModuleAuthoringState({
          creatorId: owner.creator.id,
          gameId,
        }),
      ]);
    } catch (error) {
      logSdkOwnerLookupFailure(error);
      return <CreatorOwnershipIssue kind="lookup_unavailable" />;
    }
    const candidateRevision = currentGame.packageCandidateRevision;
    const releaseProfile = sdkPortalReleaseProfile();
    return <main className="creator-dashboard">
      <header className="dashboard-header">
        <Link className="brand" href="/" aria-label="Game Fields SDK ホーム">
          <span className="brand-mark" aria-hidden="true">GF</span>
          <span>Game Fields <strong>SDK</strong></span>
        </Link>
        <nav aria-label="ゲーム管理メニュー">
          <Link href={creatorEnvironmentPath(instanceId)}>制作環境</Link>
          <Link className="dashboard-nav-active" href={requestedReturnPath}>共通モジュール設定</Link>
          {candidateRevision && <Link href={creatorGamePreviewPath({ creatorSlug: instanceId, gameId, revision: candidateRevision })}>Preview</Link>}
          {candidateRevision && <Link href={creatorGameFormalRoomPath({ creatorSlug: instanceId, gameId, revision: candidateRevision })}>正式Room</Link>}
        </nav>
        <div className="header-account-area"><AccountMenu /></div>
      </header>
      <section className="dashboard-main">
        <div className="dashboard-heading">
          <div>
            <p className="eyebrow">GAME MANAGEMENT</p>
            <h1>{currentGame.title}</h1>
            <p><strong>{releaseProfile.connectorDisplayName}</strong> · creator {instanceId} · game {gameId}</p>
            <p>共通モジュール設定とRuntime package履歴を管理します。Preview／正式Roomとは別の画面です。</p>
          </div>
          <Link className="secondary-action" href={creatorEnvironmentPath(instanceId)}>制作環境へ戻る</Link>
        </div>
        <div className="game-management-grid">
          {moduleProfile ? (
            <GameModuleReview
              instanceId={instanceId}
              gameId={gameId}
              initialProfile={moduleProfile}
              canCustomize={customizationAccess?.allowed === true}
              placement="inline"
              initialContract={creatorGameModuleAuthoringSummary(moduleContract)}
            />
          ) : <section className="dashboard-empty"><p>共通モジュール設定を取得できません。</p></section>}
          <GamePackageRevisionExport
            instanceId={instanceId}
            gameId={gameId}
            revisions={packageRevisions}
            placement="inline"
          />
        </div>
      </section>
    </main>;
  }

  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
  const linkCode = createSdkPreviewAccountLinkCode({
    playerId: account.playerId,
    playerName: account.playerName,
    audience: new URL(appBaseUrl).origin,
    creatorSlug: instanceId,
  });
  const previewQuery = new URLSearchParams();
  if (previewView) previewQuery.set("view", "preview");
  if (effectiveRevision) previewQuery.set("revision", effectiveRevision);
  const previewPath = `/sdk-preview/${instanceId}/games/${gameId}${
    previewQuery.size > 0 ? `?${previewQuery.toString()}` : ""
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
  </main>;
}
