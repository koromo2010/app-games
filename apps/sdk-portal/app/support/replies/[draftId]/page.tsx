import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountMenu } from "../../../account-menu";
import { getSdkAccountSession } from "@/lib/account-session";
import {
  CreatorSupportServiceError,
  loadCreatorSupportReplyDraft,
} from "@/lib/support-api";
import { SupportReplyApproval } from "./SupportReplyApproval";
import { createAccountContext } from "@/lib/account-context";
import { SupportAccountMismatch } from "../../SupportAccountMismatch";

export const dynamic = "force-dynamic";

export default async function SupportReplyDraftPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
  searchParams: Promise<{ accountRef?: string }>;
}) {
  const account = await getSdkAccountSession().catch(() => null);
  const { draftId } = await params;
  const { accountRef } = await searchParams;
  if (!account) {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(`/support/replies/${draftId}`)}`,
    );
  }
  if (
    accountRef
    && accountRef !== createAccountContext({
      playerId: account.playerId,
      displayName: account.playerName,
    }).accountRef
  ) return <SupportAccountMismatch />;
  let state;
  try {
    state = await loadCreatorSupportReplyDraft(
      account.playerId,
      draftId,
    );
  } catch (error) {
    if (error instanceof CreatorSupportServiceError && error.status === 404) {
      notFound();
    }
    throw error;
  }
  if (state.state === "approved") {
    redirect(`/support?thread=${encodeURIComponent(state.report.id)}`);
  }

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
    <SupportReplyApproval draft={state.draft} report={state.report} />
  </main>;
}
