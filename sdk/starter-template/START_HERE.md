# Game Fields SDK — ここから始める

これは、ChatGPTと一緒にGame Fields向けゲームを1本作るための試用スターターです。SDK本体 `@game-fields/game-sdk` v__SDK_VERSION__ も `vendor/` に同梱されているため、npm公開前でもこのZIPだけで契約テストを実行できます。

## いちばん簡単な使い方

1. ZIPを展開します。
2. このフォルダをChatGPTまたはCodexへ渡します。
3. 下の文章をそのまま送ります。

```text
このGame Fields SDKスターターを使ってゲームを1本作りたいです。
最初にAGENTS.mdとSDK_API.mdを読み、私と相談しながらGAME_SPEC.mdを完成させてください。
重要な未決事項だけを短く質問し、仕様が固まるまでは実装を始めないでください。
仕様確定後はこのフォルダ内だけでゲーム固有コードと契約テストを実装し、npm run checkとnpm run demoを成功させてください。
DB、Redis、認証Cookie、APIキー、管理権限には直接アクセスしないでください。
```

4. ChatGPTから質問されたら、作りたいゲームを普通の言葉で説明します。
5. 完成したフォルダをZIPに戻し、Game Fieldsへ提出します。

`npm install`を実行した場合も、再提出ZIPには`node_modules/`と`dist/`を含めません。

## 自分のPCで動作確認する場合

Node.js 20以上を用意し、このフォルダで次を実行します。

```bash
npm install
npm run check
npm run demo
```

最初から入っている「はじめてのゲーム」はSDKの動作確認用です。ChatGPTに依頼すると、`GAME_SPEC.md`の内容に合わせて置き換えられます。

## このZIPに含まれないもの

- Game Fields本番・devへの公開権限
- DB、Redis、Blobの接続情報
- 認証Cookieや管理者情報
- APIキー

完成物は自動公開されません。Game Fields側の検査・審査・dev実プレイ確認を通過したものだけが公開候補になります。
