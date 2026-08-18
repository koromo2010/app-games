import Link from "next/link";

export function SupportAccountMismatch() {
  return <main className="creator-dashboard">
    <section className="mock-review-error creator-account-reconnect">
      <p className="eyebrow">ACCOUNT CONTEXT MISMATCH</p>
      <h1>別のGame Fieldsアカウントで開かれています</h1>
      <p>
        この承認リンクは現在のSDKアカウントとは対応していません。
        下書きの内容や存在は表示せず、現在のアカウントへ戻ります。
      </p>
      <Link className="primary-action" href="/dashboard">マイゲームへ戻る</Link>
      <Link className="secondary-action" href="/api/account-link/start?returnTo=%2Fsupport">アカウントを再連携</Link>
    </section>
  </main>;
}
