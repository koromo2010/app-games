# Game Fields SDK — ここから始める

これは、ChatGPTと一緒にGame Fields向けゲームを1本作るための試用スターターです。SDK本体 `@game-fields/game-sdk` v__SDK_VERSION__ も `vendor/` に同梱されているため、npm公開前でもこの公開Gitまたは試用ZIPだけで契約テストを実行できます。

## いちばん簡単な使い方

1. 公開Gitから取得したこのフォルダ、または展開した試用ZIPをChatGPTの作業場所に置きます。
2. ChatGPTまたはCodexへこのフォルダを渡します。
3. 下の文章をそのまま送ります。

```text
このGame Fields SDKスターターを使ってゲームを1本作りたいです。
最初にAGENTS.md、APP_REQUIREMENTS.md、MOCK_GUIDE.md、SDK_API.mdを読み、必要事項の質問票を一度にまとめて出してください。一問ずつ質問しないでください。
私の回答後は、未定部分を安全な初期値で補ってGAME_SPEC.mdを完成させ、原則として追加確認なしで要件を守った画面モックまで作ってください。
完成後は内容と未実装部分を短く説明し、「実際に画面を見て、変えたいところはありますか？ 特になければ『これでOK』と答えてください」と聞いてください。
私が承認した後だけ、このフォルダ内でゲーム固有コードと契約テストを実装し、npm run checkとnpm run demoを成功させてください。
DB、Redis、認証Cookie、APIキー、管理権限には直接アクセスしないでください。
```

4. ChatGPTがまとめて出す質問票へ一度に回答します。「おまかせ」「未定」や空欄でも構いません。
5. `npm run package`で提出ZIPを作り、Game Fieldsへ提出します。

`npm install`を実行した場合も、再提出ZIPには`node_modules/`と`dist/`を含めません。

## 自分のPCで動作確認する場合

Node.js 20以上を用意し、このフォルダで次を実行します。

```bash
npm install
npm run check:mock
npm run check
npm run demo
npm run package
```

最初から入っている「はじめてのゲーム」はSDKの動作確認用です。ChatGPTに依頼すると、`GAME_SPEC.md`の内容に合わせて置き換えられます。

提出物は`submission/game-fields-submission.zip`へ生成されます。`node_modules/`、`dist/`、`.git/`、過去の提出ZIPは含まれません。

## このZIPに含まれないもの

- Game Fields本番・devへの公開権限
- DB、Redis、Blobの接続情報
- 認証Cookieや管理者情報
- APIキー

完成物は自動公開されません。Game Fields側の検査・審査・dev実プレイ確認を通過したものだけが公開候補になります。
