import Link from "next/link";

export function CreatorAccountReconnect({ returnTo }: { returnTo: string }) {
  const reconnectHref = `/api/account-link/start?returnTo=${encodeURIComponent(
    returnTo,
  )}`;

  return <main className="mock-review-error creator-account-reconnect">
    <section>
      <p className="eyebrow">ACCOUNT CONNECTION REQUIRED</p>
      <h1>Game Fieldsアカウントを再接続してください</h1>
      <p>
        現在接続中のアカウントでは、この制作環境を開けません。
        この環境を作成したGame Fieldsアカウントへ再接続してから、同じURLへ戻ります。
      </p>
      <Link className="primary-action" href={reconnectHref}>
        Game Fieldsアカウントを再接続
      </Link>
      <Link className="secondary-action" href="/dashboard">
        マイゲームへ戻る
      </Link>
    </section>
  </main>;
}
