import Link from "next/link";
import { normalizeAccountLinkReturnPath } from "@/lib/account-link-return";

export function CreatorAccountReconnect({ returnTo }: { returnTo: string }) {
  const safeReturnTo = normalizeAccountLinkReturnPath(returnTo);

  return <main className="mock-review-error creator-account-reconnect">
    <section>
      <p className="eyebrow">ACCOUNT CONNECTION REQUIRED</p>
      <h1>Game Fieldsアカウントを再接続してください</h1>
      <p>
        現在接続中のアカウントでは、この制作環境を開けません。
        この環境を作成したGame Fieldsアカウントへ再接続してから、同じURLへ戻ります。
      </p>
      <form method="get" action="/api/account-link/start">
        <input type="hidden" name="returnTo" value={safeReturnTo} />
        <button className="primary-action" type="submit">
          Game Fieldsアカウントを再接続
        </button>
      </form>
      <Link className="secondary-action" href="/dashboard">
        マイゲームへ戻る
      </Link>
    </section>
  </main>;
}
