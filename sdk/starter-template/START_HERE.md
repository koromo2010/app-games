# Game Fields SDK — ここから始める

これは、ChatGPTと一緒にGame Fields向けゲームを1本作り、同じAppSetのままPreviewから本番候補へ昇格させるスターターです。SDK本体`@game-fields/game-sdk` v__SDK_VERSION__を`vendor/`へ同梱しています。

## ChatGPTへ渡す依頼

```text
このGame Fields SDKスターターを使ってゲームを1本作りたいです。
最初にAGENTS.md、APP_REQUIREMENTS.md、MOCK_GUIDE.md、SDK_API.mdを読んでください。
必要事項の質問票を一度にまとめ、回答後はGAME_SPEC.md、AppSet、正式クライアント、契約テストまで実装してください。
クライアントはGameFieldsRoomのViewだけを描画し、Commandだけを送ってください。ブラウザ内にゲーム状態の正本を作らないでください。
Word DBとLLMはAppSetのcontext.resourcesからだけ利用してください。
共通モジュールは最初すべて必須です。profileを変更したり、同等機能をゲーム側へ複製しないでください。
npm run check、npm run demo、npm run diagnose:promotionを成功させ、最後にpublish:game-packageで正式Previewへ保存してください。
```

## ローカル確認

Node.js 20以上で次を実行します。

```bash
npm install
npm run check
npm run demo
npm run diagnose:promotion
npm run build:game-package
```

画面だけを先に相談するときは`npm run publish:mock`を使えます。ただし静的UIレビューであり、Room同期や本番昇格の検証ではありません。

ゲームとしての確認は`npm run publish:game-package`を使います。AppSet、クライアント、source、SHA-256を1つのrevisionへ保存し、正式な共通Roomで実行します。

```text
SDK-devのcandidate package
→ 同じrevisionをdevelopmentへ昇格
→ devで複数端末E2E
→ 同じrevisionをstableへ昇格
→ mainで表示
```

昇格時にAppSetを翻訳、修正、再buildしません。`diagnose:promotion`で止まった項目は、ゲーム側の契約不足かSDKの指示・bridge不足として明示します。

## スターターの例

「はじめてのゲーム」は小さなAppSetです。

- `src/app-set.ts`が正本のcountと勝敗を持つ
- `mock/mock.js`はRoom Viewのcountを描画する
- ボタンは`game/advance` Commandだけを送る
- 外側ShellがRoom、参加者、settings、revision、timer、再戦を所有する

新しいゲームでは、この責務分離を維持してゲーム固有部分だけを置き換えます。

## 含まれないもの

- Game Fields本番・devへの公開権限
- DB、Redis、Blobの接続情報
- 認証Cookieや管理者情報
- APIキー

完成物は自動公開されません。hash固定packageの検査、人間の審査、dev実プレイ確認を通過したrevisionだけが昇格候補になります。
