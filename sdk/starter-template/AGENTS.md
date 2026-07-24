# Game Fields ゲーム開発指示

このフォルダはGame Fieldsのゲーム固有packageです。`GAME_SPEC.md`をゲーム仕様の正本として扱ってください。

## 最初に行うこと

1. `APP_REQUIREMENTS.md`、`SDK_MODULE_CATALOG.md`、`GAME_SPEC.md`、`MOCK_GUIDE.md`、`SDK_API.md`を読む。
2. ゲームの核が決まるまでは自然に対話し、面白さ・人数・勝敗が決まったら詳細案を一括提示する。
3. 「おまかせ」「未定」を安全な初期値で補い、`GAME_SPEC.md`へAI判断と分かる形で記録する。
4. 共通moduleは最初全件必須として扱う。AIはprofileを変更せず、既存moduleと同等の処理をAppSetへ複製しない。
5. ゲーム固有AppSet、閲覧者別View、正式クライアント、契約テストを一緒に実装する。
6. `npm run check`、`npm run demo`、`npm run diagnose:promotion`を成功させる。
7. 入口から受け取ったSDK URL・制作者slug・管理トークンを一時環境変数として`npm run publish:game-package`を実行する。トークンはファイル、Git、会話、出力へ残さない。
8. SDKが返した制作者URLと正式Preview Roomを案内し、複数ブラウザ参加・同期・再接続を確認する。

`npm run publish:mock`は任意の静的UIレビューです。成功してもRoom、AppSet、同期、昇格の検証完了とは扱いません。

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
- `mock/mock.js`は`GameFieldsRoom.subscribe()`のViewを描画し、`GameFieldsRoom.send()`でCommandだけを送る。
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
- Game Fields本体、`develop`、`main`、Vercelへ直接公開しない。

## 実装の順番

1. `GAME_SPEC.md`を完成させる。
2. `mock/preview.json`と`src/manifest.ts`を同じゲームIDへ更新する。
3. `contracts.ts`へsettings、AppState、AppInput、AppCommand、AppViewを定義する。
4. `app-set.ts`へ作成・リセット、認可、フェーズ、手番、終了条件、presentationを実装する。
5. `server-module.ts`はSDK基本セットとAppSetの合成だけに保つ。
6. `mock/`の正式クライアントをRoom ViewとCommandへ接続する。
7. 正常完走、権限拒否、古いrevision、秘密遮断、失敗時非更新をテストする。
8. `npm run check`、`npm run demo`、`npm run diagnose:promotion`を実行する。
9. `npm run publish:game-package`でhash固定packageを保存する。
10. 正式Preview Roomで別ブラウザ参加、同期、再読込復帰、Word DB／LLM失敗を検証する。

## 完了条件

- `npm run diagnose:promotion`が`promotionReady: true`を返す。
- Previewと昇格後が同じpackage revision、AppSet source SHA-256、server bundle SHA-256を使う。
- 昇格処理がAppSetを翻訳、修正、再buildしない。
- 未実装やPlatform側に必要なbridgeは`SDK_REQUESTS.md`へ明記する。
