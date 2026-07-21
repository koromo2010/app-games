import portalPackage from "../package.json";

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

export default function Home() {
  const platformVersion = portalPackage.version;
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
        <span className="preview-badge">Developer preview · v{platformVersion}</span>
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
            <a className="primary-action" href="/DownloadMe.md" download>
              最新のDownloadMe
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
        <div className="hero-actions">
          <a className="primary-action" href="/DownloadMe.md" download>
            DownloadMe.mdを取得
            <span aria-hidden="true">↓</span>
          </a>
          <a className="secondary-action" href="/demo">
            デモ環境を見る
          </a>
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
