# 昇格可能なゲーム画面の作成ガイド

## 目的

`mock/`は互換上の旧ディレクトリ名です。ここにあるHTML・CSSと生成済みJavaScriptは使い捨ての静的モックではなく、共有する`src/game-client.tsx`を操作プロトタイプ用adapterと正式Room用adapterへ接続して生成します。

Previewと正式版で変わるのは公開channelだけです。昇格時にAppSetを翻訳、再build、差し替えしてはいけません。

## 作るもの

- `mock/index.html`: 外側のGame Fields Shellへ差し込むゲーム固有slot
- `mock/styles.css`: ゲーム固有画面のPC・スマホ表示
- `mock/mock.js`: 共有client sourceから生成されるbrowser bundle
- `mock/preview.json`: ゲームID・表示名・説明・人間レビュー用の品質証拠
- `src/manifest.ts`: AppSetと共通Shellの機能宣言
- `src/contracts.ts`: AppState・AppCommand・AppView
- `src/app-set.ts`: サーバーを正本とするゲーム進行
- `src/game-client.tsx`: 操作プロトタイプと正式Roomで共有するゲーム固有UI
- `src/prototype-adapter.ts`: 固定fixture、状態早送り、resetだけを提供するadapter
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

1. `GAME_SPEC.md`を確定し、`create_game_draft`だけを呼ぶ。
2. Portalのmodule review URLを利用者へ示して停止し、人間の確定後に`get_game_module_requirements`でrevision・digest・SDK versionを固定する。
3. required moduleをdelivery別に公式import/API、注入interface、またはPlatform委譲で実利用する。disabled moduleや独自代替実装は使わない。
4. `manifest.ts`、`preview.json`、`contracts.ts`、`app-set.ts`、`game-client.tsx`を同じゲームIDと共有sourceとして実装する。
5. `prototype-adapter.ts`は固定fixture、代表scene、resetだけを注入し、正式UI・AppSet・Command型を作り直さない。
6. `reviewEvidence`へ代表的な進行中・完了状態、固有要素4件以上、主操作のtarget/result、core loop、resetを宣言し、対応IDを操作プロトタイプで観測可能にする。
7. required moduleごとのimport/API、source path、runtime marker、非再実装証拠を`moduleUsage`へ記録する。
8. `publish_mock`でmodule usageと操作プロトタイプのserver-side検査を通し、URLと利用表を利用者へ提示する。
9. 利用者の明示承認後に、そのexact `prototypeRevision`を`approve_mock`で固定する。
10. Node.jsが既にあれば追加のローカル検査と`publish_game_package`、なければ同じsourceを`publish_game_source_package`へ渡し、正式Preview Roomを確認する。

MCPの`publish_mock`は互換tool名で、確定済みmodule contractと共有sourceに結び付いた必須の操作プロトタイプ検査です。任意の静的HTMLだけでは通過しません。Room同期、再接続、Platform resource実接続、本番昇格の検証結果には数えません。`publish:*:legacy` npm scriptは既存管理トークン運用専用です。

## 完了条件

- Previewで別ブラウザが同じRoomへ参加・同期できる。
- 再読込後に同じRoomへ復帰できる。
- AppSet source SHA-256とserver bundle SHA-256が保存時に表示される。
- 正式Previewからmain採用まで両hashが変わらない。
- クライアントがブラウザ内の正本状態やresource bridgeへ依存していない。
