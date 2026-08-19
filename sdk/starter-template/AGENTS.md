# Game Fields ゲーム開発指示

このフォルダはGame Fieldsのゲーム固有packageです。`GAME_SPEC.md`をゲーム仕様の正本として扱ってください。

## 最初に行うこと

1. `APP_REQUIREMENTS.md`、`SDK_MODULE_CATALOG.md`、`GAME_SPEC.md`、`MOCK_GUIDE.md`、`SDK_API.md`を読む。
2. ゲームの核が決まるまでは自然に対話し、面白さ・人数・勝敗が決まったら詳細案を一括提示する。
3. 「おまかせ」「未定」を安全な初期値で補い、`GAME_SPEC.md`へAI判断と分かる形で記録する。
4. 仕様確定後はgame draftだけを作り、人間がPortalでmodule profileを確定するまでUI、AppSet、adapterを実装しない。
5. 確定済み`moduleProfileRevision`・`moduleContractDigest`・SDK versionを固定し、required moduleをdelivery別の公式SDK契約で実利用する。available moduleは必要な場合だけ公式契約で利用し、disabled moduleや同等の独自処理を使わない。
6. ゲーム固有AppSet、閲覧者別View、共有`game-client.tsx`、prototype adapter、契約テストを一緒に実装する。
7. ローカルNode.jsが既にある場合は`npm run check`、`npm run demo`、`npm run diagnose:promotion`を追加検証として成功させる。インストールを標準経路の前提にしない。
8. OAuth接続済みGame Fields SDK MCPの`publish_game_source_package`、または検査済み`game-package/`を渡す`publish_game_package`を使う。アクセストークンや管理トークンを取得・表示・保存しない。
9. SDKが返した制作者URLと正式Preview Roomを案内し、複数ブラウザ参加・同期・再接続を確認する。

MCPの`publish_mock`は互換tool名で、確定module contractと共有sourceに結び付いた操作プロトタイプ検査です。`preview.json.reviewEvidence`の代表状態・固有要素・操作結果・完了・core loop・resetとmodule usageを検査し、利用者本人が`prototypeRevision`を明示承認するまで正式packageへ進みません。任意の静的HTMLだけでは通過せず、成功しても正式Room同期や昇格の検証完了とは扱いません。`publish:*:legacy` npm scriptは既存の管理トークン運用専用で、新規ChatGPT Work / Claude Code制作では実行しません。

## 編集してよい範囲

- `GAME_SPEC.md`
- `MOCK_REVIEW.md`
- `SDK_REQUESTS.md`
- `mock/`
- `src/`
- `tests/`
- このゲーム固有のREADMEや提出資料

同梱された`vendor/`内のSDK tarballは変更しません。SDKに不足がある場合はゲーム側へ危険な代替実装を加えず、`SDK_REQUESTS.md`へ必要なinterface、入力、出力、失敗時の扱いを書いてください。

## 必須境界

- `mock/`は旧称だが、Previewと昇格後に同じrevisionで使う正式クライアントである。
- `mock/index.html`はゲーム固有slotだけにする。広場、ヘッダー、部屋作成・参加、参加者、設定、ルール、デバッグ、退出・再戦を複製しない。
- 正式Room bundleは共有`game-client.tsx`を`GameFieldsRoom.subscribe()/send()` adapterへ接続して生成し、Commandだけを送る。prototype bundleは同じclientをfixture adapterへ接続する。
- ブラウザ内の変数、localStorage、IndexedDBをゲーム状態の正本にしない。
- `GameFieldsPreset.registerGame()`へローカル進行を登録しない。
- Word DBとLLMをブラウザから呼ばない。AppSetの`context.resources`だけを使う。
- DB、Redis、Blob、認証Cookie、APIキー、管理者情報へ直接アクセスしない。
- Command payloadへactor ID、player ID、表示名を本人証明として入れない。Runtimeが`context.actor`を注入する。
- UI表示だけで認可しない。`app-set.ts`の`applyAppCommand`で権限、phase、手番、入力を検証する。
- SDK基本セットがRoom作成、参加・退出、設定、revision、共通権限、中断、再戦、timerを所有する。AppSetへ複製しない。
- `app-set.ts`はゲーム固有state、Command、勝敗、固有presentationだけを登録する。
- `presentApp`は閲覧者別のゲーム固有Viewだけを返し、秘密、内部player ID、正解を権限のないViewへ含めない。
- 取得・生成・入力検証に失敗したtransitionは保存せず、revision、手番、timerを進めない。
- 結果の`reason`は機械判定用コード、`presentation.reason`は日本語・英語の終了理由として分離する。
- `presentation.highlights`には共有して安全な見どころを最大3件、`presentation.playLog`には参加者本人の履歴へ残す時系列を最大50件入れる。秘密、内部ID、prompt、未公開情報、同意のない参加者名は含めない。
- Game Fields本体、`develop`、`main`、Vercelへ直接公開しない。

## 実装の順番

1. `GAME_SPEC.md`を完成させる。
2. `create_game_draft`でmetadataだけを作り、人間のmodule profile確定を待つ。
3. `get_game_module_requirements`のrevision/digest/SDK versionとdelivery契約を固定する。
4. `mock/preview.json`と`src/manifest.ts`を同じゲームIDへ更新する。
5. `contracts.ts`へsettings、AppState、AppInput、AppCommand、AppViewを定義する。
6. `app-set.ts`へ作成・リセット、認可、フェーズ、手番、終了条件、presentationを実装する。
7. `game-client.tsx`を正式UI正本とし、`prototype-adapter.ts`はfixture、状態早送り、resetだけに保つ。
8. required moduleと実際に使うavailable moduleの実import/API、source path、runtime evidenceを検証し、`server-module.ts`はSDK基本セットとAppSetの合成だけに保つ。
9. 正常完走、権限拒否、古いrevision、秘密遮断、失敗時非更新をテストする。
10. Node.jsが既にある場合だけ`npm run check`、`npm run demo`、`npm run diagnose:promotion`を追加検査として実行する。
11. 同じ共有sourceをMCPの`publish_game_source_package`（または検査済みpackage用`publish_game_package`）でhash固定保存する。
12. 正式Preview Roomで別ブラウザ参加、同期、再読込復帰、Word DB／LLM失敗を検証する。

## 完了条件

- Node.jsで追加検査を実行した場合は`npm run diagnose:promotion`が`promotionReady: true`を返す。Node-free経路では対応するserver-side gateが成功する。
- Previewと昇格後が同じpackage revision、AppSet source SHA-256、server bundle SHA-256を使う。
- 昇格処理がAppSetを翻訳、修正、再buildしない。
- 未実装やPlatform側に必要なbridgeは`SDK_REQUESTS.md`へ明記する。
