import Link from "next/link";

export const metadata = {
  title: "保護者の方へ",
};

export default function ForParentsPage() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Game Fields SDK ホームへ戻る">
          <span className="brand-mark" aria-hidden="true">
            GF
          </span>
          <span>
            Game Fields <strong>SDK</strong>
          </span>
        </Link>
        <nav aria-label="主要ナビゲーション">
          <Link href="/">トップへ戻る</Link>
        </nav>
      </header>

      <section className="section" id="for-parents">
        <div className="section-heading">
          <p className="eyebrow">保護者の方へ</p>
          <h1>お子さまの「作ってみたい」を、AIと一緒にカタチに。</h1>
          <p>
            Game Fields SDKは、お子さまが思いついたゲームのアイデアを、AIに話しかけるだけで実際に遊べる形にしていく仕組みです。プログラミングの経験がなくても、「こんなゲームを作りたい」と伝えることから制作が始まります。
          </p>
        </div>

        <div className="sdk-help-list">
          <article>
            <h2>どんな体験ができるか</h2>
            <p>
              ルールを考える、できあがったものを試す、うまくいかない部分を直す、という一連の流れをAIと一緒に進めます。書きたいことを言葉にする力や、試行錯誤しながら形にしていく力が育つ体験です。完成すると、実際にブラウザで遊べるURLが届きます。
            </p>
          </article>
          <article>
            <h2>安全性について</h2>
            <p>
              お子さまが作業する場所は、Game Fieldsの本番環境や他の利用者のデータとは切り離された安全な場所です。作ったものが他の人に影響を与えることはありません。また、現時点では誰でも遊べる形で一般公開する仕組みはまだ準備中のため、他のプレイヤーと直接つながる状態にはなりません。
            </p>
          </article>
          <article>
            <h2>費用について</h2>
            <p>
              利用にはChatGPTの有料プラン（Plus・Pro・Teamなど）と、Codex・Workが使える環境が必要です。この利用料金はご家庭のご負担となり、Game Fieldsが代わりに支払うことはありません。始める前に、ご家庭のChatGPTの契約状況をご確認ください。
            </p>
          </article>
          <article>
            <h2>アカウントとログイン情報について</h2>
            <p>
              作ったゲームはGame Fieldsアカウントに保存されます。パスワードなどのログイン情報がSDKやChatGPTに渡ることはありません。アカウントの接続は、Game Fields側のログイン画面を通じて行われます。
            </p>
          </article>
        </div>

        <p>
          利用条件の詳細は<Link href="/terms">利用規約</Link>をご確認ください。ご不明な点があれば、お子さまと一緒に内容を確認してから始めることをおすすめします。
        </p>
      </section>

      <footer>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            GF
          </span>
          <span>Game Fields SDK</span>
        </div>
        <p>保護者の方向けのご案内ページです。</p>
      </footer>
    </main>
  );
}
