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
      "本番と同じ挙動を再現する確認用Runtimeを使い、権限・秘密情報の扱いや同時更新時の動作を提出前にチェックします。",
  },
  {
    number: "03",
    title: "Submit for review",
    description:
      "完成したゲームをGame Fieldsへ提出します。外部開発者に本番環境の権限は渡しません。",
  },
];

const available = [
  "SDK基本セットの上にゲーム固有のルールや画面を組み込める",
  "Room(対戦・協力プレイ用の部屋)の作成・参加・設定を標準機能として利用できる",
  "本体Game Fieldsと同じバージョンのSDKで動作確認できる",
  "認証済みの操作だけを受け付ける仕組みがあり、なりすましを防げる",
  "保存データとプレイヤーごとの見え方を安全に分け、情報漏れを防げる",
  "古いデータのまま上書きしてしまう事故を防ぐ仕組みがある",
  "本番のデータベースやRedisがなくても、手元だけで動作確認できる",
  "作ったSDKパッケージを外部にインストールして最終確認できる",
  "本番環境との接続部分もあらかじめ検証済み",
];

const reviewFlow = [
  "Package submission",
  "Automated checks",
  "Game Fields review",
  "Main adoption",
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
          {linked && <Link href="/dashboard">マイゲーム</Link>}
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
            Game Fields SDKは、外部の開発者が本番データや管理機能に触れずに、ゲームを作って提出できる開発基盤です。
          </p>
          <aside className="required-environment" aria-labelledby="before-download-title">
            <span className="required-environment-label">ダウンロード前に確認</span>
            <div>
              <h3 id="before-download-title">ChatGPTの有料プランと「gameapp-dev」プラグインが必要です</h3>
              <p>
                DownloadMeを使った制作には、ChatGPTの有料プラン（Plus・Pro・Team等）でCodexまたはWorkが利用できることと、「gameapp-dev」プラグインが導入済みであることが前提です。準備ができてから、下のDownloadMeを取得してください。
              </p>
              <p>
                ChatGPTの利用料金はご自身のアカウントでの契約・お支払いとなります。Game Fieldsが利用料を負担することはありません。
              </p>
              <p>
                制作を始める前に<Link href="/terms">利用規約</Link>をご確認ください。DownloadMeを取得・使用した時点で、利用規約に同意したものとして扱います。
              </p>
            </div>
          </aside>
          <div className="hero-actions">
            <a className="primary-action" href="/GameFieldsDownloadMe-ver15.md" download>
              GameFieldsDownloadMe-ver15
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
            <code>{`const appSet =
  defineGameSdkOnlineRoomAppSet({
  createAppState(input) {
    return createGameState(input)
  },

  applyAppCommand(room, command, context) {
    return runGameCommand(
      room,
      command,
      context.actor
    )
  },

  presentApp(room, context) {
    return {
      view: createGameView(room, context.viewer)
    }
  }
})

createGameSdkOnlineRoomModule(appSet)`}</code>
          </pre>
          <div className="contract-card__footer">
            <span>SDK basic set</span>
            <span>game AppSet</span>
            <span>safe composition</span>
          </div>
        </div>
      </section>

      <section className="start section" id="start">
        <div className="section-heading">
          <p className="eyebrow">START A PREVIEW INSTANCE</p>
          <h2>自分専用の確認環境で試す</h2>
          <p>
            制作者ごとに専用のURLを用意します。作ったゲームはそこに追加され、本番と同じ流れで動作を確認できます。
          </p>
        </div>
        <aside className="required-environment" aria-labelledby="account-link-title">
          <span className="required-environment-label">アカウント接続</span>
          <div>
            <h3 id="account-link-title">{linked ? `${account?.playerName || "Game Fieldsアカウント"}へ接続済みです` : "先にGame Fieldsアカウントを接続してください"}</h3>
            <p>Game Fields本体と同じアカウントに制作物を紐づけます。パスワードやログイン情報をSDKやChatGPTへ渡すことはありません。</p>
            {!linked && <Link className="secondary-action" href="/api/account-link/start">Game Fieldsでログインして接続</Link>}
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
          <span className="required-environment-label">利用時の注意</span>
          <div>
            <h3 id="required-environment-title">ダウンロードしたファイルは、そのままCodex/Workのチャットへ添付してください</h3>
            <p>
              ゲームのコード取得・複数ファイルの編集・動作検査・SDKへの保存とURL発行を行うため、通常のChatGPTチャットだけでは制作を完了できません。CodexまたはWorkのチャットで進めてください。
            </p>
            <p>
              DownloadMeはAIが読む実行契約です。人間向けの説明書ではないため、内容を読んだり編集したりせず、そのままチャットへ添付してください。
            </p>
            <p>
              <strong>プラグインが更新された後は、必ず新しいチャットを作成してください。</strong>
              古いチャットのまま最新版のファイルを送っても、更新前の内容のまま動いてしまい、制作を正しく再開できません。新しいチャットで`gameapp-dev`を選択し、最新版のDownloadMeだけを添付してください。
            </p>
            <p>
              保存済みの制作者環境とゲームはアカウントに紐づいているため、新しいチャットから自動的に再取得できます。作り直しや新しいURLの予約は不要です。
            </p>
            <p>
              通常チャットでHTMLファイルだけが作られた場合、それはGame Fields SDKへ保存された完成版ではありません。CodexまたはWorkの新しいチャットへ切り替え、最新版ファイルとゲームの希望を送ってください。
            </p>
          </div>
        </aside>
        <p className="start-note">
          制作開始時は必ず新しいチャットを使ってください。接続が成功して制作が始まった後は、URLが案内されるまで同じチャットを続けてください。エラーで保存できなかった場合は、AIが未完了であることと次にすべきことを案内します。
        </p>
        <div className="hero-actions">
          <a className="primary-action" href="/GameFieldsDownloadMe-ver15.md" download>
            GameFieldsDownloadMe-ver15.mdを取得
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

      <section className="section" id="scope">
        <div className="section-heading">
          <p className="eyebrow">WHAT YOU CAN BUILD</p>
          <h2>SDKで作れるもの・作れないもの</h2>
          <p>
            外部開発者が担当できる範囲と、Game Fields側が管理する範囲を分けています。着手前に必ずご確認ください。
          </p>
        </div>
        <div className="sdk-help-list">
          <article>
            <h2>作れるもの</h2>
            <p>
              SDK基本セットの上に、ゲーム固有のルール・画面・進行ロジックを組み込めます。Room作成・参加・設定・データ管理など、対戦や協力プレイに必要な共通機能はSDKが提供するため、ゲーム内容そのものの作り込みに専念できます。
            </p>
          </article>
          <article>
            <h2>作れないもの</h2>
            <p>
              本番データベース・Redis・Blobストレージへの直接アクセス、独自の認証・決済・課金機能の実装、Game Fields本体やVercel本番環境への直接デプロイはできません。これらはGame Fields側が管理し、外部開発者に権限を渡すことはありません。必要な機能がSDKにない場合は、AIがその内容を記録し、審査チームへ共有します。
            </p>
          </article>
        </div>
      </section>

      <section className="status section" id="status">
        <div className="status-panel">
          <div>
            <p className="eyebrow">CURRENT STATUS</p>
            <h2>いま使える機能と、これから追加される機能</h2>
            <p className="status-copy">
              SDK基本セットを使ったゲームの制作・検証は今すぐ行えます。npm registryでの一般公開、チュートリアル、提出画面は準備中で、審査の仕組みが整い次第追加します。
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
          <h2>すべての提出物は審査を経てから公開されます</h2>
          <p>
            自動検査に加えて、Game Fieldsによる審査を必ず経てから本番へ反映されます。検査の一部は今後AIによる自動化を広げていく予定です。
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
        <p>Platform v{platformVersion} · Build the game. Submit the package. Release through the gate. · <Link href="/terms">利用規約</Link></p>
      </footer>
    </main>
  );
}
