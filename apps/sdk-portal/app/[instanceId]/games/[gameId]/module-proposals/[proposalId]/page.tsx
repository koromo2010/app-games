import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSdkAccountSession } from "@/lib/account-session";
import { authenticateCreatorOwner, normalizeInstanceSlug, validateInstanceSlug } from "@/lib/instance-registry";
import { getCreatorGameModuleProfileProposal, listCreatorGameModuleProfileProposalAudit } from "@/lib/module-profile-proposal-store";
import { AccountMenu } from "../../../../../account-menu";
import { ModuleProfileProposalReview } from "./ModuleProfileProposalReview";

export const dynamic = "force-dynamic";

const GAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ModuleProfileProposalPage({ params }: { params: Promise<{ instanceId: string; gameId: string; proposalId: string }> }) {
  const raw = await params;
  const slug = normalizeInstanceSlug(raw.instanceId);
  const gameId = raw.gameId.trim().toLowerCase();
  const proposalId = raw.proposalId.trim();
  if (validateInstanceSlug(slug) || !GAME_PATTERN.test(gameId) || !UUID_PATTERN.test(proposalId)) notFound();
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) redirect(`/api/account-link/start?returnTo=${encodeURIComponent(`/${slug}/games/${gameId}/module-proposals/${proposalId}`)}`);
  const owner = await authenticateCreatorOwner(slug, account.playerId);
  if (!owner) notFound();
  const proposal = await getCreatorGameModuleProfileProposal({ creatorId: owner.id, gameId, proposalId });
  if (!proposal) notFound();
  const audit = await listCreatorGameModuleProfileProposalAudit({ creatorId: owner.id, gameId, proposalId });
  return <main className="creator-dashboard">
    <header className="dashboard-header">
      <Link className="brand" href="/" aria-label="Game Fields SDK ホーム"><span className="brand-mark" aria-hidden="true">GF</span><span>Game Fields <strong>SDK</strong></span></Link>
      <nav aria-label="ゲーム管理メニュー"><Link href={`/${slug}/games/${gameId}?view=modules`}>共通モジュール設定</Link><Link className="dashboard-nav-active" href={`/${slug}/games/${gameId}/module-proposals/${proposalId}`}>変更案レビュー</Link></nav>
      <div className="header-account-area"><AccountMenu /></div>
    </header>
    <section className="dashboard-main">
      <div className="dashboard-heading"><div><p className="eyebrow">HUMAN REVIEW ONLY</p><h1>module構成変更案</h1><p>creator {slug} · game {gameId} · proposal {proposal.id}</p><p>AIが保存した変更案を確認・編集し、本人の明示承認でのみactive profileへ反映します。</p></div><Link className="secondary-action" href={`/${slug}/games/${gameId}?view=modules`}>module設定へ戻る</Link></div>
      <ModuleProfileProposalReview initialProposal={proposal} initialAudit={audit as unknown[]} instanceId={slug} gameId={gameId} />
    </section>
  </main>;
}
