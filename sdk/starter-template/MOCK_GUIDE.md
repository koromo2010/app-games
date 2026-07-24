# 昇格可能なゲーム画面の作成ガイド

## 目的

`mock/`は旧称です。ここにあるHTML・CSS・JavaScriptは画面確認だけの使い捨てモックではなく、AppSetと同じpackageへ入り、Previewと昇格後に同じrevisionで実行される正式クライアントです。

Previewと正式版で変わるのは公開channelだけです。昇格時にAppSetを翻訳、再build、差し替えしてはいけません。

## 作るもの

- `mock/index.html`: 外側のGame Fields Shellへ差し込むゲーム固有slot
- `mock/styles.css`: ゲーム固有画面のPC・スマホ表示
- `mock/mock.js`: `GameFieldsRoom`のView描画とCommand送信
- `mock/preview.json`: ゲームID・表示名・説明
- `src/manifest.ts`: AppSetと共通Shellの機能宣言
- `src/contracts.ts`: AppState・AppCommand・AppView
- `src/app-set.ts`: サーバーを正本とするゲーム進行
- `tests/`: 完走、権限、revision、秘密情報の契約テスト

## 必須の接続

クライアントはAppSetが返した閲覧者別Viewだけを描画します。

```js
GameFieldsRoom.subscribe((snapshot) => {
  render(snapshot?.view?.app, snapshot?.view?.common);
});

await GameFieldsRoom.send({
  type: "game/submit",
  value: input.value
});
```

- ブラウザ内の変数をゲーム状態の正本にしない。
- `start`、`abort`、`rematch`をローカルcallbackへ接続しない。
- actor ID、player ID、表示名を本人証明として送らない。
- 外側Shellの広場、部屋作成・参加、参加者、設定、ルール、デバッグ、再戦を複製しない。
- AppSetの`presentApp`で本人・他プレイヤー・観戦者ごとの情報を分ける。

Word DBとLLMはクライアントへbridgeしません。AppSetからPlatform resourceを呼びます。

```ts
const words = await requireGameSdkContentSource(
  context.resources,
).drawWords({
  pool: "general-words",
  difficulty: room.settings.wordDifficulty, // easy | normal | hard
  count: 8,
});
```

```ts
const generated = await requireGameSdkLlmGateway(
  context.resources,
).generate({
  task: "answer-question",
  prompt: buildReviewedPrompt(command.question, room.app.history),
  promptVersion: "answer-question-v1",
  quality: "standard",
});
```

取得・生成に失敗したtransitionは保存せず、revision、手番、timerを進めません。固定単語、偽の回答、ブラウザ側fallbackを追加しません。

## 実装順

1. `GAME_SPEC.md`を確定する。
2. `manifest.ts`と`preview.json`を同じゲームIDへ更新する。
3. `contracts.ts`と`app-set.ts`へゲーム固有state・Command・Viewを実装する。
4. `mock.js`を`GameFieldsRoom.subscribe/send`へ接続する。
5. PC幅・スマホ幅、ホスト・一般参加者、待機・エラー・結果を確認する。
6. 正常完走、権限拒否、古いrevision、秘密遮断をテストする。
7. `npm run check`と`npm run demo`を通す。
8. `npm run diagnose:promotion`を実行する。
9. `npm run publish:game-package`でpackageを保存する。
10. 返された正式Preview Roomを複数ブラウザで確認する。

画面だけを先に相談したい場合は`npm run publish:mock`を使えますが、これは静的UIレビューです。Room同期、再接続、AppSet、Word DB、LLM、本番昇格の検証結果には数えません。

## 完了条件

- Previewで別ブラウザが同じRoomへ参加・同期できる。
- 再読込後に同じRoomへ復帰できる。
- AppSet source SHA-256とserver bundle SHA-256が保存時に表示される。
- development昇格、stable昇格で両hashが変わらない。
- クライアントがブラウザ内の正本状態やresource bridgeへ依存していない。
