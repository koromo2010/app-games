import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountMenu } from "../account-menu";
import { getSdkAccountSession } from "@/lib/account-session";
import { listAccountGames, listCreatorEnvironments } from "@/lib/instance-registry";
import { SubmitGameButton } from "./SubmitGameButton";

export const dynamic = "force-dynamic";

type Game = Awaited<ReturnType<typeof listAccountGames>>[number];

function gameStage(game: Game) {
  if (game.stableAvailable) return { label: "採用済み", tone: "stable" };
  if (game.developmentAvailable) return { label: "採用確認中", tone: "development" };
  if (game.packageAvailable) return { label: "正式提出済み", tone: "submitted" };
  if (game.mockAvailable) return { label: "試作中", tone: "draft" };
  return { label: "下書き", tone: "draft" };
}

function gameHref(game: Game) {
  if (game.packageAvailable) return `/${game.creatorSlug}/games/${game.gameId}`;
  if (game.mockAvailable) return `/${game.creatorSlug}/mock/${game.gameId}`;
  return `/${game.creatorSlug}`;
}

function candidatePreviewHref(game: Game) {
  if (!game.packageCandidateRevision) return null;
  return `/${game.creatorSlug}/games/${game.gameId}?revision=${encodeURIComponent(game.packageCandidateRevision)}`;
}

export default async function CreatorDashboard() {
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) redirect("/api/account-link/start?returnTo=%2Fdashboard");

  const [environments, games] = await Promise.all([
    listCreatorEnvironments(account.playerId),
    listAccountGames(account.playerId),
  ]);
  const submitted = games.filter((game) => game.packageAvailable).length;
  const adopted = games.filter((game) => game.stableAvailable).length;

  return <main className="creator-dashboard">
    <header className="dashboard-header">
      <Link className="brand" href="/" aria-label="Game Fields SDK ホーム">
        <span className="brand-mark" aria-hidden="true">GF</span>
        <span>Game Fields <strong>SDK</strong></span>
      </Link>
      <nav aria-label="制作者メニュー">
        <Link className="dashboard-nav-active" href="/dashboard">マイゲーム</Link>
        <Link href="/support">サポート</Link>
        <Link href="/#start">新しく作る</Link>
        <Link href="/#review">提出について</Link>
        <Link href="/help">Help</Link>
      </nav>
      <div className="header-account-area"><AccountMenu /></div>
    </header>

    <section className="dashboard-main">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">CREATOR DASHBOARD</p>
          <h1>マイゲーム</h1>
          <p>正式提出の有無にかかわらず、このアカウントで作ったゲームをすべて確認できます。</p>
        </div>
        <Link className="primary-action" href="/#start">新しいゲームを作る <span aria-hidden="true">→</span></Link>
      </div>

      <div className="dashboard-stats" aria-label="制作状況">
        <article><strong>{games.length}</strong><span>すべてのゲーム</span></article>
        <article><strong>{games.length - submitted}</strong><span>提出前</span></article>
        <article><strong>{submitted}</strong><span>正式提出済み</span></article>
        <article><strong>{adopted}</strong><span>採用済み</span></article>
      </div>

      {games.length > 0 ? <div className="creator-game-grid">
        {games.map((game) => {
          const stage = gameStage(game);
          const candidateHref = candidatePreviewHref(game);
          return <article className="creator-game-card" key={`${game.creatorSlug}/${game.gameId}`}>
            <div className="creator-game-card__meta">
              <span className={`game-stage game-stage--${stage.tone}`}>{stage.label}</span>
              <span>{game.creatorDisplayName} / {game.creatorSlug}</span>
            </div>
            <div>
              <h2>{game.title}</h2>
              <p>{game.description || "説明はまだ登録されていません。"}</p>
            </div>
            <div className="creator-game-card__actions">
              {candidateHref && game.packageCandidateAvailable ? (
                <Link className="primary-action" href={candidateHref}>正式Roomで確認 <span aria-hidden="true">→</span></Link>
              ) : (
                <Link className="primary-action" href={gameHref(game)}>ゲームを開く <span aria-hidden="true">→</span></Link>
              )}
              <Link className="secondary-action" href={`/${game.creatorSlug}/games/${game.gameId}`}>共通モジュール設定</Link>
              <Link className="secondary-action" href={`/${game.creatorSlug}/games/${game.gameId}`}>制作環境</Link>
              {game.packageCandidateAvailable && (
                <SubmitGameButton
                  instanceId={game.creatorSlug}
                  gameId={game.gameId}
                  isUpdate={game.packageAvailable}
                />
              )}
            </div>
            {!game.packageAvailable && !game.packageCandidateAvailable && <p className="submission-hint">正式提出データはまだ準備されていません。制作を完了すると、ここに正式提出ボタンが表示されます。</p>}
            {game.packageCandidateAvailable && <p className="submission-hint">
              提出候補のPackageがあります。正式提出する前に「正式Roomで確認」から実際のRoomで動作確認してください。
              packageRevision: <code>{game.packageCandidateRevision}</code> · ready-for-submission
            </p>}
          </article>;
        })}
      </div> : <section className="dashboard-empty">
        <p className="eyebrow">NO GAMES YET</p>
        <h2>まだアカウントにゲームがありません</h2>
        <p>ゲームを制作して最初のモックをSDKへ保存すると、正式提出前でもここに追加されます。</p>
        <Link className="primary-action" href="/#start">最初のゲームを作る <span aria-hidden="true">→</span></Link>
      </section>}

      {environments.length > 0 && <section className="creator-environments">
        <div><p className="eyebrow">CREATOR ENVIRONMENTS</p><h2>制作環境</h2></div>
        <div>{environments.map((environment) => <Link href={`/${environment.slug}`} key={environment.slug}>
          <span><strong>{environment.displayName}</strong><small>/{environment.slug}</small></span>
          <span>{environment.gameCount}ゲーム →</span>
        </Link>)}</div>
      </section>}
    </section>
  </main>;
}
