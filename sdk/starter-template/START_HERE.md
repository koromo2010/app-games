# Game Fields SDK — ここから始める

これは、ChatGPT WorkまたはClaude Codeと一緒にGame Fields向けゲームを1本作り、同じ共有sourceのままPreviewから本番候補へ昇格させるスターターです。SDK本体`@game-fields/game-sdk` v__SDK_VERSION__を`vendor/`へ同梱しています。通常チャット、Claude Desktop通常チャット、Coworkは制作クライアントとして未対応です。

## ChatGPT Work / Claude Codeへ渡す依頼

```text
このGame Fields SDKスターターを使ってゲームを1本作りたいです。
最初にAGENTS.md、APP_REQUIREMENTS.md、MOCK_GUIDE.md、SDK_API.mdを読んでください。
面白さ・人数・勝敗を自然な対話で決め、詳細案を一度に提示してください。GAME_SPEC.mdの確定後にgame draftを作り、system-default由来の初期module contractなら人間確認を偽装せずそのままUIやAppSetへ進んでください。初期profileを変更する場合だけproposalを作り、本人の明示確定まで実装を停止してください。
クライアントはGameFieldsRoomのViewだけを描画し、Commandだけを送ってください。ブラウザ内にゲーム状態の正本を作らないでください。
Word DBとLLMはAppSetのcontext.resourcesからだけ利用してください。
進行・共通moduleはgame draftで原則必須です。不要な進行部品はAIが削除提案できますが、人間がPortalで確認するまで外しません。共通Word DBは固定標準、LLM・カード・描画は任意利用です。確定revision/digestを取得し、required moduleと実際に使うavailable moduleはdelivery別の公式SDK契約で利用してください。同等機能をゲーム側へ複製しないでください。
npm run check、npm run demo、npm run diagnose:promotionを成功させ、最後にOAuth接続済みGame Fields SDK MCPのpublish_game_packageで正式Previewへ保存してください。
```

## ローカル確認

Node.js 20以上が既にある場合だけ、追加のローカル証拠として次を実行できます。一般の制作者にNode.jsのインストールを求めず、標準経路はMCPのserver-side検査を使います。

```bash
npm install
npm run check
npm run demo
npm run diagnose:promotion
npm run build:game-package
```

共有する`src/game-client.tsx`・AppSet・Command sourceを一度だけ作り、`src/prototype-adapter.ts`から操作可能なfixtureを注入します。MCPの`publish_mock`は互換tool名で、module-boundな操作プロトタイプをserver-side検査します。利用者は主要操作、状態変化、完了、reset、module利用表を確認し、返された`prototypeRevision`を明示承認します。これは正式Room同期や本番昇格の検証ではありません。

ゲームとしての確認は、Node.jsがすでにある場合だけ`game-package/`を`publish_game_package`へ渡し、ない場合は同じ共有sourceを`publish_game_source_package`へ渡します。AppSet、クライアント、module binding、source、SHA-256を1つのrevisionへ保存し、制作者コードは隔離された正式な共通Roomだけで実行します。Node.js、npm、Git、CLIのインストールを標準経路の前提にせず、OAuth資格情報を会話、ファイル、Git、コマンド引数へ展開しません。

```text
SDKのcandidate package
→ 正式Previewで複数端末E2E
→ 運営が同じrevisionをmainへ採用
→ mainで表示
```

採用時にAppSetを翻訳、修正、再buildしません。`dev`は本体コードの検証環境であり、SDK作品の採用経路ではありません。`diagnose:promotion`で止まった項目は、ゲーム側の契約不足かSDKの指示・bridge不足として明示します。

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
