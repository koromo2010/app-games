import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountMenu } from "../account-menu";
import { getSdkAccountSession } from "@/lib/account-session";
import { listCreatorSupportReports } from "@/lib/support-api";
import { SupportInbox } from "./SupportInbox";

export const dynamic = "force-dynamic";

export default async function CreatorSupportPage() {
  const account = await getSdkAccountSession().catch(() => null);
  if (!account) redirect("/api/account-link/start?returnTo=%2Fsupport");
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
    />
  </main>;
}
