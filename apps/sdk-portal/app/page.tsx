import portalPackage from "../package.json";
import Link from "next/link";
import { getSdkAccountSession } from "@/lib/account-session";
import { AccountMenu } from "./account-menu";

const foundations = [
  {
    number: "01",
    title: "Build locally",
    description:
      "本番DBやアカウント情報に触れず、ゲーム固有のルールと画面をローカルで組み立てます。",
  },
  {
    number: "02",
    title: "Validate safely",
    description:
      "Mock Runtimeと契約テストで、権限・秘密情報・同時更新の境界を提出前に確認します。",
  },
  {
    number: "03",
    title: "Submit for review",
    description:
      "完成したゲームをGame Fieldsへ提出します。外部開発者に本番環境の権限は渡しません。",
  },
];

const available = [
  "Platformと同じリリース版の@game-fields/game-sdk",
  "認証済みactorを受け取るCommand契約",
  "保存Roomと閲覧者別RoomViewの分離",
  "revision不一致を拒否するRuntime契約",
  "DB・Redis不要のメモリMock Runtime",
  "tarballの外部install・export検査",
  "本体統合用adapterの認証・Redis CAS実証",
];

const reviewFlow = [
  "Package submission",
  "Automated checks",
  "Game Fields review",
  "Dev playtest",
  "Main release",
];

const firstBuildGuide = [
  {
    title: "最初のモックは10〜20分が目安",
    description:
      "ゲーム内容を伝えたあと、AIが画面作成・検査・SDKへの保存まで進めます。内容によってはもう少しかかることがあります。",
  },
  {
    title: "作業中でも、気づいたことを書いてOK",
    description:
      "「色を変えたい」「このルールも追加したい」など、完成を待たずにそのまま送ってください。AIが追加内容を受け取り、制作の続きへ反映します。",
  },
  {
    title: "完成すると、遊べるURLが届きます",
    description:
      "ローカルファイルではなく、Game Fields SDKの確認URLが案内されます。URLを開いて遊び、気に入らない部分は同じチャットで修正できます。",
  },
];

export default async function Home() {
  const platformVersion = portalPackage.version;
  const account = await getSdkAccountSession().catch(() => null);
  const linked = Boolean(account);
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Game Fields SDK ホーム">
          <span className="brand-mark" aria-hidden="true">
            GF
          </span>
          <span>
            Game Fields <strong>SDK</strong>
          </span>
        </a>
        <nav aria-label="主要ナビゲーション">
          <a href="#start">Start</a>
          <a href="#foundation">Foundation</a>
          <a href="#status">Status</a>
          <a href="#review">Review gate</a>
        </nav>
        <div className="header-account-area">
          <span className="preview-badge">Developer preview · v{platformVersion}</span>
          <AccountMenu />
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">GAME DEVELOPMENT, WITHOUT PLATFORM ACCESS</p>
          <h1>
            ゲームの面白さに集中する。
            <span>公開の安全性は、プラットフォームが守る。</span>
          </h1>
          <p className="hero-description">
            Game Fields SDKは、外部開発者が本番データや管理機能へ触れずに、
            ゲーム固有部分を作成・検証・提出するための開発基盤です。
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="/GameFieldsDownloadMe-ver5.md" download>
              GameFieldsDownloadMe-ver5
              <span aria-hidden="true">↓</span>
            </a>
            <a className="primary-action" href="#foundation">
              SDKの構成を見る
              <span aria-hidden="true">→</span>
            </a>
            <a className="secondary-action" href="#status">
              現在の準備状況
            </a>
          </div>
        </div>

        <div className="contract-card" aria-label="SDK契約の概要">
          <div className="contract-card__bar">
            <span />
            <span />
            <span />
            <code>game-module.ts</code>
          </div>
          <pre>
            <code>{`defineGameServerModule({
  createRoom(input, context) {
    return createInitialRoom(
      input,
      context.actor
    )
  },

  applyCommand(room, command, context) {
    return runAuthorizedCommand(
      room,
      command,
      context.actor
    )
  },

  presentRoom(room, context) {
    return createViewerSafeView(
      room,
      context.viewer
    )
  }
})`}</code>
          </pre>
          <div className="contract-card__footer">
            <span>trusted actor</span>
            <span>viewer-safe data</span>
            <span>revisioned command</span>
          </div>
        </div>
      </section>

      <section className="start section" id="start">
        <div className="section-heading">
          <p className="eyebrow">START A PREVIEW INSTANCE</p>
          <h2>自分専用のGame Fieldsで試す</h2>
          <p>
            制作者ごとの専用URLに広場と部屋を用意します。新しいゲームは同じ広場へ追加され、本番と同じ導線で検証できます。
          </p>
        </div>
        <aside className="required-environment" aria-labelledby="account-link-title">
          <span className="required-environment-label">アカウント接続</span>
          <div>
            <h3 id="account-link-title">{linked ? `${account?.playerName || "Game Fieldsアカウント"}へ接続済みです` : "先にGame Fieldsアカウントを接続してください"}</h3>
            <p>表のGame Fieldsと同じアカウントへ制作物を紐づけます。パスワードや表サイトのログインCookieをSDKやChatGPTへ渡すことはありません。</p>
            {!linked && <a className="secondary-action" href="/api/account-link/start">Game Fieldsでログインして接続</a>}
          </div>
        </aside>
        <div className="first-build-guide" aria-label="初めてゲームを作る方への案内">
          {firstBuildGuide.map((item, index) => (
            <article key={item.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
        <aside className="required-environment" aria-labelledby="required-environment-title">
          <span className="required-environment-label">ご利用前に確認</span>
          <div>
            <h3 id="required-environment-title">ゲーム制作にはChatGPTのCodexまたはWorkが必要です</h3>
            <p>
              ダウンロードしたファイルは、CodexまたはWorkのチャットへ添付してください。ゲームのコード取得・複数ファイルの編集・動作検査・SDKへの保存とURL発行を行うため、通常のChatGPTチャットだけでは制作を完了できません。
            </p>
            <p>
              通常チャットでHTMLファイルだけが作られた場合、それはGame Fields SDKへ保存された完成版ではありません。CodexまたはWorkへ切り替え、同じファイルとゲームの希望を送ってください。
            </p>
          </div>
        </aside>
        <p className="start-note">
          途中で画面を閉じたり新しいチャットへ移ったりせず、URLが案内されるまで同じチャットでお待ちください。エラーなどで保存できなかった場合は、AIが未完了であることと次の対応を案内します。
        </p>
        <div className="hero-actions">
          <a className="primary-action" href="/GameFieldsDownloadMe-ver5.md" download>
            GameFieldsDownloadMe-ver5.mdを取得
            <span aria-hidden="true">↓</span>
          </a>
          <Link className="secondary-action" href="/demo">
            デモ環境を見る
          </Link>
        </div>
      </section>

      <section className="foundation section" id="foundation">
        <div className="section-heading">
          <p className="eyebrow">THE DEVELOPMENT BOUNDARY</p>
          <h2>作る自由と、公開権限を分ける</h2>
          <p>
            SDKは一般に利用できるようにしつつ、Game Fields本体への公開は必ず管理下のゲートを通します。
          </p>
        </div>
        <div className="foundation-grid">
          {foundations.map((item) => (
            <article key={item.number}>
              <span className="card-number">{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="status section" id="status">
        <div className="status-panel">
          <div>
            <p className="eyebrow">SDK V1 FOUNDATION</p>
            <h2>配布前に検証できるpackage境界まで完成</h2>
            <p className="status-copy">
              独立packageのbuild・pack・外部installと、本体側adapterの認証・Redis CASは検証済みです。npm registryへの初回公開、チュートリアル、提出画面は審査ゲートを整えてから追加します。
            </p>
          </div>
          <ul>
            {available.map((item) => (
              <li key={item}>
                <span aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="review section" id="review">
        <div className="section-heading">
          <p className="eyebrow">MANAGED RELEASE GATE</p>
          <h2>無審査でmainへ届く経路は作らない</h2>
          <p>
            検査の一部は将来AIへ拡張できますが、すべての提出物は最低1つのGame Fields管理ゲートを通ります。
          </p>
        </div>
        <ol className="review-flow">
          {reviewFlow.map((item, index) => (
            <li key={item}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item}</strong>
            </li>
          ))}
        </ol>
      </section>

      <footer>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            GF
          </span>
          <span>Game Fields SDK</span>
        </div>
        <p>Platform v{platformVersion} · Build the game. Submit the package. Release through the gate.</p>
      </footer>
    </main>
  );
}
