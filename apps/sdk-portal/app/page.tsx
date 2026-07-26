import portalPackage from "../package.json";
import Link from "next/link";
import { getSdkAccountSession } from "@/lib/account-session";
import { AccountMenu } from "./account-menu";

const foundations = [
  {
    number: "01",
    title: "Build locally",
    description:
      "本番のデータやアカウント情報にはさわらず、自分のパソコンの中でゲームのルールや画面を作ります。",
  },
  {
    number: "02",
    title: "Validate safely",
    description:
      "本番と同じ動きをする確認用の仕組みを使って、提出する前に安全かどうかをチェックします。",
  },
  {
    number: "03",
    title: "Submit for review",
    description:
      "完成したゲームはGame Fieldsに提出します。外部の開発者に本番環境の権限を渡すことはありません。",
  },
];

const available = [
  "SDKを使って、そのゲームだけのルールや画面を作れる",
  "対戦や協力プレイをする「部屋」を作ったり、参加したり、設定したりできる",
  "本物のGame Fieldsと同じSDKで、動きを確認できる",
  "本人だと確認された操作しか受け付けないので、なりすましを防げる",
  "保存したデータとプレイヤーごとの画面を安全に分けて、情報が漏れないようにできる",
  "古いデータのまま間違って上書きしてしまう事故を防げる",
  "本番のデータベースがなくても、自分のパソコンだけで動作を確認できる",
  "作ったものを外部に取り込んで、最後の確認ができる",
  "本番環境とつなぐ部分も、あらかじめ確認済み",
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
        <nav aria-label="目次">
          <span className="nav-toc-label" aria-hidden="true">目次</span>
          {linked && <Link href="/dashboard">マイゲーム</Link>}
          <a href="#start">はじめかた</a>
          <a href="#foundation">つくる流れ</a>
          <a href="#scope">できること</a>
          <a href="#status">対応状況</a>
        </nav>
        <div className="header-account-area">
          <span className="preview-badge">開発者向け先行公開 · v{platformVersion}</span>
          <AccountMenu />
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">本番環境にさわらずにゲーム開発</p>
          <h1>
            ゲームを面白くすることだけ考えよう。
            <span>安全に届ける仕組みは、Game Fieldsが用意します。</span>
          </h1>
          <p className="hero-description">
            Game Fields SDKを使うと、外部の人でも本番のデータや管理画面にさわらずに、ゲームを作って提出できます。
          </p>
          <aside className="required-environment" aria-labelledby="before-download-title">
            <span className="required-environment-label">ダウンロード前に確認</span>
            <div>
              <h3 id="before-download-title">ChatGPTの有料プランと「gameapp-dev」プラグインが必要です</h3>
              <p>
                ゲームを作るには、ChatGPTの有料プラン（Plus・Pro・Teamなど）と、CodexまたはWork、そして「gameapp-dev」というプラグインが必要です。この3つを用意してから、下のDownloadMeを取得してください。
              </p>
              <p>
                ChatGPTの利用料金は、あなた自身の支払いになります。Game Fieldsが代わりに支払うことはありません。
              </p>
              <p>
                作り始める前に、<Link href="/terms">利用規約</Link>を読んでおいてください。DownloadMeを取得・使用した時点で、規約に同意したものとして扱います。
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
            <span>SDK基本セット</span>
            <span>ゲームAppSet</span>
            <span>安全な組み合わせ</span>
          </div>
        </div>
      </section>

      <section className="start section" id="start">
        <div className="section-heading">
          <p className="eyebrow">お試し環境で確認</p>
          <h2>自分専用のお試し環境で遊んでみる</h2>
          <p>
            あなた専用のURLを1つ用意します。作ったゲームはそこに追加され、本番と同じように動くかを確認できます。
          </p>
        </div>
        <aside className="required-environment" aria-labelledby="account-link-title">
          <span className="required-environment-label">アカウント接続</span>
          <div>
            <h3 id="account-link-title">{linked ? `${account?.playerName || "Game Fieldsアカウント"}へ接続済みです` : "先にGame Fieldsアカウントを接続してください"}</h3>
            <p>作ったゲームは、あなたのGame Fieldsアカウントに結びつけます。パスワードなどのログイン情報をSDKやChatGPTに渡すことはありません。</p>
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
            <h3 id="required-environment-title">ダウンロードしたファイルは、Codex(またはWork)のチャットにそのまま貼り付けてください</h3>
            <p>
              ゲーム作りには、コードを作ったり、複数のファイルを編集したり、動きを確認したりする作業が必要です。ふつうのChatGPTチャットだけでは、これができません。必ずCodexまたはWorkのチャットで進めてください。
            </p>
            <p>
              DownloadMeは、AIに読ませるためのファイルです。人が読むための説明書ではないので、中身を読んだり書き換えたりせず、そのままチャットに貼り付けてください。
            </p>
            <p>
              <strong>プラグインが新しくなったときは、必ず新しいチャットを作り直してください。</strong>
              古いチャットのまま新しいファイルを送っても、古いままの動きになってしまい、うまく続きが作れません。新しいチャットで`gameapp-dev`を選び、最新のDownloadMeだけを貼り付けてください。
            </p>
            <p>
              作りかけのゲームは、あなたのアカウントに保存されています。新しいチャットを開けば自動的に続きから始められるので、作り直したり新しいURLを用意し直したりする必要はありません。
            </p>
            <p>
              ふつうのチャットでHTMLファイルだけが出てきた場合、それはまだGame Fields SDKに保存された完成版ではありません。CodexまたはWorkの新しいチャットに切り替えて、最新のファイルと作りたい内容を送ってください。
            </p>
          </div>
        </aside>
        <p className="start-note">
          作り始めるときは、必ず新しいチャットを使ってください。うまくつながって制作が始まったら、URLが届くまで同じチャットのまま続けてください。もし保存でエラーが起きたときは、AIが「まだ終わっていないこと」と「次にやること」を教えてくれます。
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
          <p className="eyebrow">開発の考え方</p>
          <h2>自由に作れる。でも、公開は必ずチェックする。</h2>
          <p>
            SDKは誰でも使えるようにします。でも、Game Fields本体で公開する前には、必ずチェックを行います。
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
          <p className="eyebrow">できること・できないこと</p>
          <h2>SDKで作れるもの・作れないもの</h2>
          <p>
            外部の人が作れる範囲と、Game Fieldsが管理する範囲を分けています。作り始める前に確認してください。
          </p>
        </div>
        <div className="sdk-help-list">
          <article>
            <h2>作れるもの</h2>
            <p>
              SDKを使えば、そのゲームだけのルールや画面、進み方を作れます。対戦や協力プレイに必要な部屋作り・参加・設定などの共通の仕組みはSDKが用意しているので、あなたはゲームの中身を作ることだけに集中できます。
            </p>
          </article>
          <article>
            <h2>作れないもの</h2>
            <p>
              本番のデータベースやファイル保存の仕組みに直接さわることはできません。自分でログイン機能や課金機能を作ったり、Game Fields本体やVercelの本番環境に直接公開したりすることもできません。これらはすべてGame Fields側が管理しています。もし足りない機能があれば、AIがその内容を記録して、審査チームに伝えます。
            </p>
          </article>
        </div>
      </section>

      <section className="status section" id="status">
        <div className="status-panel">
          <div>
            <p className="eyebrow">いまの状況</p>
            <h2>今できること、これから増えること</h2>
            <p className="status-copy">
              SDKを使ったゲーム作りと動作確認は、今すぐ始められます。誰でもダウンロードできるようにする公開や、使い方の説明、提出画面はまだ準備中です。審査の仕組みが整い次第、追加します。
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

      <footer>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            GF
          </span>
          <span>Game Fields SDK</span>
        </div>
        <p>Platform v{platformVersion} · ゲームを作って、届けよう。 · <Link href="/terms">利用規約</Link></p>
      </footer>
    </main>
  );
}
