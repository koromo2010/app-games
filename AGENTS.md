# Game Fields ゲーム開発指示

このフォルダはGame Fieldsのゲーム固有packageです。`GAME_SPEC.md`をゲーム仕様の正本として扱ってください。

## 最初に行うこと

1. `APP_REQUIREMENTS.md`、`SDK_MODULE_CATALOG.md`、`GAME_SPEC.md`、`MOCK_GUIDE.md`、`SDK_API.md`を読む。
2. 入口ですでに予約した制作者用URLを確認する。URLはゲームごとに作らず、同じ制作者の広場へ今回のゲームカードを追加する前提にする。
3. ゲームの核が決まるまでは自然に対話し、面白さ・人数・勝敗が決まったら詳細案を一括提示する。
4. 「おまかせ」「未定」や空欄を安全な初期値で補い、`GAME_SPEC.md`を完成させる。仮置き不能な重大事項だけ、追加質問を一度にまとめて行う。
5. 原則として追加の仕様確認を挟まず、`APP_REQUIREMENTS.md`を守った画面モック、`mock/preview.json`、`MOCK_REVIEW.md`を作る。`SDK_MODULE_CATALOG.md`から利用できる標準UI・トランプ・お絵描き等を先に選び、同等機能を再実装しない。
6. `npm run check:mock`後、入口から受け取ったSDK URL・制作者slug・管理トークンを環境変数として`npm run publish:mock`を実行する。トークンはファイル、Git、会話、コマンド出力へ残さない。
7. 発行された制作者側のモックURLと未実装部分を短く説明し、「実際に画面を見て、変えたいところはありますか？ 特になければ『これでOK』と答えてください」と確認する。
8. 利用者が明確に承認してからゲーム契約の本実装を始める。

質問票への回答前に長い設計や実装を始めません。回答後は細かな確認を繰り返さず、AI判断を明記してモックまで進めます。具体的なゲーム案を勝手に採用せず、添付資料の具体例を今回の仕様とみなしません。

## 編集してよい範囲

- `GAME_SPEC.md`
- `MOCK_REVIEW.md`
- `mock/`
- `src/`
- `tests/`
- このゲーム固有のREADMEや提出資料

同梱された`vendor/`内のSDK tarballは変更しません。SDKに不足がある場合はゲーム側へ危険な代替実装を加えず、`SDK_REQUESTS.md`へ必要なinterfaceを書いてください。

## 必須境界

- DB、Redis、Blob、認証Cookie、APIキー、管理者情報へ直接アクセスしない。
- Command payloadへactor ID、player ID、表示名を本人証明として入れない。Runtimeが`context.actor`を注入する。
- UI上の表示制御だけで認可しない。最終認可は`applyCommand`で検証する。
- 保存Roomをそのまま返さず、`presentRoom`で閲覧者別`RoomView`へ変換する。
- 秘密情報、内部player ID、正解、手札等を権限のないRoomViewへ含めない。
- Roomの`code`を変更しない。Commandごとにrevisionをちょうど1増やす。
- Game Fields本体、`develop`、`main`、Vercelへ直接公開しない。

## 実装の順番

1. `GAME_SPEC.md`を完成させる。
2. `mock/`と`MOCK_REVIEW.md`を作り、`npm run check:mock`を通す。
3. `npm run publish:mock`でSDKへ保存し、発行URLを利用者へ案内する。
4. 利用者からモックの承認を得る。
5. `manifest.ts`を仕様へ合わせる。
6. `contracts.ts`へRoom、CreateInput、Command、RoomViewを定義する。
7. ゲーム判定を純粋関数として実装する。
8. `server-module.ts`で作成、認可、フェーズ、手番、終了条件、presentationを実装する。
9. 正常系、権限拒否、古いrevision、秘密情報遮断、最後までの進行をテストする。
10. デバッグ権限、ダミー参加者、視点・状態切替、自動進行、中断の各経路をテストする。
11. `demo.ts`を更新し、ダミープレイヤーだけで1ゲームを完走させる。

## 完了条件

```bash
npm run check
npm run demo
```

両方が成功し、`SUBMISSION_CHECKLIST.md`を更新してから完了報告してください。未実装、未検証、Game Fields側の統合が必要な項目は明記してください。
