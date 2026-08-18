import Link from "next/link";
import { getSdkAccountSession } from "@/lib/account-session";
import { createAccountContext, shortenAccountRef } from "@/lib/account-context";

function accountInitial(name: string | null) {
  return (name?.trim().charAt(0) || "GF").toUpperCase();
}

export async function AccountMenu() {
  const account = await getSdkAccountSession().catch(() => null);

  if (!account) {
    return (
      <form method="get" action="/api/account-link/start">
        <button className="account-login" type="submit">ログイン</button>
      </form>
    );
  }

  const label = account.playerName || "連携済みアカウント";
  const context = createAccountContext({
    playerId: account.playerId,
    displayName: account.playerName,
  });
  return (
    <details className="account-menu">
      <summary aria-label={`${label}のアカウントメニュー`}>
        <span className="account-avatar" aria-hidden="true">{accountInitial(account.playerName)}</span>
        <span className="account-summary-copy">
          <small>SDKログイン中</small>
          <strong>{label}</strong>
        </span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="account-popover">
        <p className="account-status"><span aria-hidden="true">✓</span> SDKログイン中</p>
        <div className="linked-account">
          <small>現在のSDKアカウント / 環境</small>
          <strong>{context.displayName || "Game Fieldsアカウント"} · {context.environment}</strong>
          <small>accountRef: {shortenAccountRef(context.accountRef)}</small>
        </div>
        <div className="linked-account">
          <small>Game Fields本体との連携</small>
          <strong>{account.playerName ? `${account.playerName} と連携済み` : "連携済み（表示名は再連携後に表示）"}</strong>
        </div>
        <Link href="/dashboard">マイゲーム</Link>
        <Link href="/support">サポート・報告</Link>
        <form className="account-link-form" method="get" action="/api/account-link/start">
          <button type="submit">本体アカウントを再連携</button>
        </form>
        <form action="/api/account-link/logout" method="post">
          <button type="submit">ログアウト</button>
        </form>
      </div>
    </details>
  );
}
