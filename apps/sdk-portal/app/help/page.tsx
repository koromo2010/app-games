import Link from "next/link";
import { AccountMenu } from "../account-menu";
import { SDK_HELP_ENTRIES } from "@/lib/sdk-help";

export default function SdkHelpPage() {
  return <main className="creator-dashboard">
    <header className="dashboard-header">
      <Link className="brand" href="/" aria-label="Game Fields SDK ホーム">
        <span className="brand-mark" aria-hidden="true">GF</span>
        <span>Game Fields <strong>SDK</strong></span>
      </Link>
      <nav aria-label="制作者メニュー">
        <Link href="/dashboard">マイゲーム</Link>
        <Link className="dashboard-nav-active" href="/help">Help</Link>
      </nav>
      <div className="header-account-area"><AccountMenu /></div>
    </header>

    <section className="dashboard-main">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">SDK HELP</p>
          <h1>制作・提出について</h1>
          <p>ここに表示する回答と、制作AIが参照する回答は同じHelp正本から生成されます。</p>
        </div>
      </div>
      <div className="sdk-help-list">
        {SDK_HELP_ENTRIES.map((entry) => <article id={entry.id} key={entry.id}>
          <p className="eyebrow">{entry.title}</p>
          <h2>{entry.question}</h2>
          <p>{entry.answer}</p>
        </article>)}
      </div>
    </section>
  </main>;
}
