# Game Fields ゲーム開発指示

このフォルダはGame Fieldsのゲーム固有packageです。`GAME_SPEC.md`をゲーム仕様の正本として扱ってください。

## 最初に行うこと

1. `APP_REQUIREMENTS.md`、`GAME_SPEC.md`、`MOCK_GUIDE.md`、`SDK_API.md`を読む。
2. 作りたいアプリを普通の言葉で聞き、重要な未決事項を一つずつ質問して`GAME_SPEC.md`を完成させる。
3. 仕様確定後、`APP_REQUIREMENTS.md`を守った画面モックと`MOCK_REVIEW.md`を作る。
4. モックの内容、要件への対応、まだ動かない部分を利用者へ説明し、確認を待つ。
5. 利用者が明確に承認してからゲーム契約の本実装を始める。

起動直後に長い設計や実装を始めません。具体的なゲーム案を勝手に採用せず、添付資料の具体例を今回の仕様とみなしません。

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
3. 利用者からモックの承認を得る。
4. `manifest.ts`を仕様へ合わせる。
5. `contracts.ts`へRoom、CreateInput、Command、RoomViewを定義する。
6. ゲーム判定を純粋関数として実装する。
7. `server-module.ts`で作成、認可、フェーズ、手番、終了条件、presentationを実装する。
8. 正常系、権限拒否、古いrevision、秘密情報遮断、最後までの進行をテストする。
9. `demo.ts`を更新し、ダミープレイヤーだけで1ゲームを完走させる。

## 完了条件

```bash
npm run check
npm run demo
```

両方が成功し、`SUBMISSION_CHECKLIST.md`を更新してから完了報告してください。未実装、未検証、Game Fields側の統合が必要な項目は明記してください。
