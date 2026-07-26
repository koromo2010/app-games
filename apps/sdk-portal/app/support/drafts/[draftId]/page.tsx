import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountMenu } from "../../../account-menu";
import { getSdkAccountSession } from "@/lib/account-session";
import { loadCreatorSupportDraft } from "@/lib/support-api";
import { SupportDraftApproval } from "./SupportDraftApproval";

export const dynamic = "force-dynamic";

export default async function SupportDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const account = await getSdkAccountSession().catch(() => null);
  const { draftId } = await params;
  if (!account) {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(`/support/drafts/${draftId}`)}`,
    );
  }
  const state = await loadCreatorSupportDraft(account.playerId, draftId)
    .catch(() => null);
  if (!state) notFound();
  if (state.state === "approved") redirect("/support");

  return <main className="creator-dashboard">
    <header className="dashboard-header">
      <Link className="brand" href="/" aria-label="Game Fields SDK ホーム">
        <span className="brand-mark" aria-hidden="true">GF</span>
        <span>Game Fields <strong>SDK</strong></span>
      </Link>
      <nav aria-label="制作者メニュー">
        <Link href="/dashboard">マイゲーム</Link>
        <Link className="dashboard-nav-active" href="/support">サポート</Link>
        <Link href="/help">Help</Link>
      </nav>
      <div className="header-account-area"><AccountMenu /></div>
    </header>
    <SupportDraftApproval draft={state.draft} />
  </main>;
}
