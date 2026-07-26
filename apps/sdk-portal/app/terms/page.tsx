import Link from "next/link";

export const metadata = {
  title: "利用規約",
};

export default function TermsPage() {
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

      <section className="section" id="terms">
        <div className="section-heading">
          <p className="eyebrow">DRAFT · NOT FINAL</p>
          <h1>Game Fields SDK 利用規約（たたき台）</h1>
          <p>
            本ページは検討中のたたき台であり、正式な利用規約ではありません。内容は今後の法務確認・修正により変更される可能性があります。DownloadMeの取得・使用をもって、現時点の内容に同意したものとして扱いますが、正式版が別途案内された場合はそちらが優先されます。
          </p>
        </div>

        <div className="sdk-help-list">
          <article>
            <h2>第1条（適用範囲）</h2>
            <p>
              本規約は、Game Fields SDK（以下「本SDK」）を利用して外部開発者がゲームを制作・提出する際の条件を定めます。本SDKを利用した時点で、本規約に同意したものとみなします。
            </p>
          </article>
          <article>
            <h2>第2条（利用環境・費用）</h2>
            <p>
              本SDKの利用にはChatGPTの有料プラン（Codex・Work）および「gameapp-dev」プラグインが必要です。ChatGPTの利用に関する料金は利用者ご自身の契約・負担とし、Game Fieldsはこれを負担・補償しません。
            </p>
          </article>
          <article>
            <h2>第3条（開発できる範囲）</h2>
            <p>
              利用者は、SDK基本セットが提供するRoom・Command・Runtime契約の範囲内で、ゲーム固有のルール・画面・進行ロジック（AppSet）を開発できます。本番データベース・Redis・Blobストレージへの直接アクセス、独自の認証・決済機能の実装、Game Fields本体またはVercel本番環境への直接デプロイは認められません。
            </p>
          </article>
          <article>
            <h2>第4条（提出・審査）</h2>
            <p>
              制作したゲームは、Game Fieldsが定める自動検査および人による審査を経てから本番へ採用されます。審査を経ない経路での公開は行われません。審査基準・採否はGame Fieldsの判断によります。
            </p>
          </article>
          <article>
            <h2>第5条（禁止事項）</h2>
            <p>
              本番環境の認証情報・APIキー・Cookie等へのアクセス、本SDKの脆弱性を突く行為、他の利用者・プレイヤーへ不利益を与える行為、法令または公序良俗に反する行為を禁止します。
            </p>
          </article>
          <article>
            <h2>第6条（知的財産）</h2>
            <p>
              利用者が制作したゲーム固有のコード・素材の権利帰属、およびGame Fieldsへの提出・採用に伴うライセンス条件については、別途定める提出時の合意によります（本ドラフトでは未確定です）。
            </p>
          </article>
          <article>
            <h2>第7条（免責事項）</h2>
            <p>
              Game Fieldsは、本SDKの利用によって利用者に生じた損害（ChatGPT利用料を含みますがこれに限りません）について、故意または重過失がある場合を除き責任を負いません。本SDKは現状有姿で提供され、動作の完全性を保証しません。
            </p>
          </article>
          <article>
            <h2>第8条（規約の変更）</h2>
            <p>
              Game Fieldsは、本規約の内容を予告なく変更できるものとします。変更後の内容は、本ページの更新をもって効力を生じます。
            </p>
          </article>
        </div>
      </section>

      <footer>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            GF
          </span>
          <span>Game Fields SDK</span>
        </div>
        <p>本ページはたたき台であり、正式な利用規約ではありません。</p>
      </footer>
    </main>
  );
}
