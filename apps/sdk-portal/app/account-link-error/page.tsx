import { normalizeAccountLinkReturnPath } from "@/lib/account-link-return";

export default async function AccountLinkErrorPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = normalizeAccountLinkReturnPath(query.returnTo);
  return (
    <main className="mock-review-error creator-account-reconnect">
      <section>
        <p className="eyebrow">ACCOUNT CONNECTION ERROR</p>
        <h1>Game Fieldsアカウントへ接続できませんでした</h1>
        <p role="alert">
          接続処理を開始できませんでした。時間をおいて、もう一度お試しください。
        </p>
        <form method="get" action="/api/account-link/start">
          <input type="hidden" name="returnTo" value={returnTo} />
          <button className="primary-action" type="submit">もう一度接続する</button>
        </form>
        <a className="secondary-action" href={returnTo}>
          元のページへ戻る
        </a>
      </section>
    </main>
  );
}
