import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountMenu } from "../account-menu";
import { getSdkAccountSession } from "@/lib/account-session";
import { listCreatorSupportReports } from "@/lib/support-api";
import { SupportInbox } from "./SupportInbox";

export const dynamic = "force-dynamic";

export default async function CreatorSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestedThread = typeof query.thread === "string"
    && /^report_[0-9a-f-]{36}$/i.test(query.thread)
    ? query.thread
    : null;
  const returnTo = requestedThread
    ? `/support?thread=${encodeURIComponent(requestedThread)}`
    : "/support";
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) {
    redirect(
      `/api/account-link/start?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }
  const initialReports = await listCreatorSupportReports(account.playerId)
    .catch(() => null);

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
    <SupportInbox
      initialReports={initialReports ?? []}
      initialLoadFailed={initialReports === null}
      initialThreadId={requestedThread}
    />
  </main>;
}
