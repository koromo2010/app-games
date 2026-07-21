# Game Fields ゲーム開発指示

このフォルダはGame Fieldsのゲーム固有packageです。`GAME_SPEC.md`をゲーム仕様の正本として扱ってください。

## 最初に行うこと

1. `GAME_SPEC.md`と`SDK_API.md`を読む。
2. 重要な未決事項を利用者へ質問し、`GAME_SPEC.md`を完成させる。
3. 仕様が確定してから実装を始める。

## 編集してよい範囲

- `GAME_SPEC.md`
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

1. `manifest.ts`を仕様へ合わせる。
2. `contracts.ts`へRoom、CreateInput、Command、RoomViewを定義する。
3. ゲーム判定を純粋関数として実装する。
4. `server-module.ts`で作成、認可、フェーズ、手番、終了条件、presentationを実装する。
5. 正常系、権限拒否、古いrevision、秘密情報遮断、最後までの進行をテストする。
6. `demo.ts`を更新し、ダミープレイヤーだけで1ゲームを完走させる。

## 完了条件

```bash
npm run check
npm run demo
```

両方が成功し、`SUBMISSION_CHECKLIST.md`を更新してから完了報告してください。未実装、未検証、Game Fields側の統合が必要な項目は明記してください。
