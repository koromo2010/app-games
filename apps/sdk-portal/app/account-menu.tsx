import { getSdkAccountSession } from "@/lib/account-session";

function accountInitial(name: string | null) {
  return (name?.trim().charAt(0) || "GF").toUpperCase();
}

export async function AccountMenu() {
  const account = await getSdkAccountSession().catch(() => null);

  if (!account) {
    return <a className="account-login" href="/api/account-link/start">ログイン</a>;
  }

  const label = account.playerName || "連携済みアカウント";
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
          <small>Game Fields本体との連携</small>
          <strong>{account.playerName ? `${account.playerName} と連携済み` : "連携済み（表示名は再連携後に表示）"}</strong>
        </div>
        <a href="/api/account-link/start">本体アカウントを再連携</a>
        <form action="/api/account-link/logout" method="post">
          <button type="submit">ログアウト</button>
        </form>
      </div>
    </details>
  );
}
