import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  createSdkPreviewAccountLinkCode,
  getSdkAccountSession,
} from "@/lib/account-session";
import {
  authenticateCreatorOwner,
  listAccountGames,
  normalizeInstanceSlug,
  validateInstanceSlug,
} from "@/lib/instance-registry";

export default async function PreviewInstancePage({ params }: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  const slug = normalizeInstanceSlug(instanceId);
  if (validateInstanceSlug(slug)) notFound();
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(`/${slug}`)}`,
    );
  }
  const isOwner = Boolean(
    await authenticateCreatorOwner(slug, account.playerId).catch(() => null),
  );
  if (!isOwner) notFound();

  const creatorGames = (await listAccountGames(account.playerId).catch(() => []))
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
