import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  createSdkPreviewAccountLinkCode,
  getSdkAccountSession,
} from "@/lib/account-session";
import {
  listAccountGames,
  normalizeInstanceSlug,
  resolveCreatorOwner,
  validateInstanceSlug,
} from "@/lib/instance-registry";
import { resolveSdkSession } from "@/lib/sdk-owner-classification";
import {
  logSdkOwnerLookupFailure,
  logSdkSessionLookupFailure,
} from "@/lib/sdk-owner-observability";
import { CreatorAccountReconnect } from "../CreatorAccountReconnect";
import { CreatorOwnershipIssue } from "../CreatorOwnershipIssue";

export default async function PreviewInstancePage({ params }: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  const slug = normalizeInstanceSlug(instanceId);
  if (validateInstanceSlug(slug)) notFound();
  let session;
  try {
    session = await resolveSdkSession(getSdkAccountSession);
  } catch (error) {
    logSdkSessionLookupFailure(error);
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  if (session.status === "session_missing") {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(`/${slug}`)}`,
    );
  }
  const account = session.account;
  let owner;
  try {
    owner = await resolveCreatorOwner(slug, account.playerId);
  } catch {
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  if (owner.status === "owner_mismatch") {
    return <CreatorAccountReconnect returnTo={`/${slug}`} />;
  }
  if (owner.status !== "authorized") {
    return <CreatorOwnershipIssue kind="record_inconsistency" />;
  }

  let creatorGames;
  try {
    creatorGames = await listAccountGames(account.playerId);
  } catch (error) {
    logSdkOwnerLookupFailure(error);
    return <CreatorOwnershipIssue kind="lookup_unavailable" />;
  }
  creatorGames = creatorGames
    .filter((game) => game.creatorSlug === slug);
  const packageReadyGames = creatorGames.filter((game) => (
    game.packageCandidateAvailable && game.packageCandidateRevision
  ));

  // A creator environment with one package-ready game should open the same
  // revision-pinned GameSdkFrame used by formal Room verification. The legacy
  // preview shell remains only for environments that still have no package.
  if (creatorGames.length === 1 && packageReadyGames.length === 1) {
    const game = packageReadyGames[0];
    redirect(
      `/${slug}/games/${game.gameId}?revision=${encodeURIComponent(
        game.packageCandidateRevision!,
      )}`,
    );
  }

  const appBaseUrl = process.env.GAME_FIELDS_PREVIEW_APP_URL?.replace(/\/$/, "")
    ?? (process.env.VERCEL_GIT_COMMIT_REF === "main" ? "https://www.game-fields.com" : "https://dev.game-fields.com");
  const linkCode = createSdkPreviewAccountLinkCode({
    playerId: account.playerId,
    playerName: account.playerName,
    audience: new URL(appBaseUrl).origin,
    creatorSlug: slug,
  });
  const previewUrl = `${appBaseUrl}/sdk-preview/${slug}#${new URLSearchParams({
    sdkPreviewLink: linkCode,
  }).toString()}`;
  return <main className="platform-preview-shell">
    <iframe className="platform-preview-frame" src={previewUrl} title={`${slug}のGame Fields開発環境`} allow="fullscreen" />
    <nav className="creator-preview-actions" aria-label="制作者用メニュー">
      <span>CREATOR</span>
      <Link href="/support">サポート</Link>
      <Link href="/dashboard">マイゲーム・編集</Link>
    </nav>
  </main>;
}
