# Game Fieldsでゲームを作る

このファイルは、ChatGPT Proと一緒にGame Fields向けゲーム制作を始めるための入口です。SDK本体やゲーム雛形はこのファイルには入っていません。ChatGPTが下記の公開スターターを取得して作業します。

## 利用者が行うこと

1. このファイルをChatGPTへ添付します。
2. 次の一文を送ります。

```text
このファイルに従って、Game Fields向けのゲームを作りたいです。
```

以降はChatGPTの質問に、作りたいゲームを普通の言葉で答えてください。

---

## ChatGPTへの実行指示

この文書を読んだChatGPTは、次の順番を守ってください。

### 1. 作業能力を確認する

最初に、現在のモードで以下を実行できるか確認してください。

- 公開Gitリポジトリを取得する
- 複数ファイルを読み書きする
- Node.jsのコマンドを実行する
- 完成したZIPファイルを利用者へ返す

すべて可能なら、モードの説明や確認質問をせず、そのまま次へ進んでください。

一つでも実行できない場合は、実装したふりをせず、次の案内だけを表示して作業を止めてください。

> このゲーム制作にはコード操作が必要です。ChatGPTのWorkモードまたはCodexを開き、このファイルをもう一度添付してください。

### 2. 公式スターターを取得する

新しい空の作業場所で、次の公開ブランチだけを浅く取得してください。

```bash
git clone --depth 1 --single-branch --branch sdk-starter https://github.com/koromo2010/app-games.git game-fields-game
cd game-fields-game
```

取得後、`starter-manifest.json`の以下を確認してください。

- `repository`が`https://github.com/koromo2010/app-games`
- `ref`が`sdk-starter`
- `sdkVersion`が空でない

不一致やファイル欠落がある場合は作業を止め、取得に失敗したことを利用者へ伝えてください。他のリポジトリ、ブランチ、非公式ミラーへ切り替えないでください。

### 3. スターターの指示を読む

次の順で読み、以降はリポジトリ内の指示を正本として扱ってください。

1. `START_HERE.md`
2. `AGENTS.md`
3. `APP_REQUIREMENTS.md`
4. `GAME_SPEC.md`
5. `MOCK_GUIDE.md`
6. `SDK_API.md`

読み終えたら、まず利用者へ「どんなアプリを作りたいですか？」と質問してください。重要な未決事項だけを一つずつ短く確認し、`GAME_SPEC.md`が固まる前にモックや実装を作り始めないでください。

### 4. 仕様に沿ったモックを作る

`GAME_SPEC.md`の未決事項が解消したら、`APP_REQUIREMENTS.md`と`MOCK_GUIDE.md`に従い、`mock/`へブラウザで開ける画面モックを作ってください。

モック作成後は、利用者へ次の内容を短く説明してください。

- 作った画面と操作の流れ
- Game Fields共通要件をどう反映したか
- モックで確認できる状態
- 本実装まで動かない部分

利用者へモックの確認を依頼し、修正希望または本実装へ進む承認を待ってください。明確な承認前にSDK契約の本実装へ進まないでください。

### 5. 承認後に実装・検査・提出物作成まで進める

仕様確定後は、スターター内だけでゲーム固有コードとテストを実装し、次をすべて成功させてください。

```bash
npm install
npm run check:mock
npm run check
npm run demo
npm run package
```

最後に`submission/game-fields-submission.zip`を利用者へ返し、実装済みの内容、テスト結果、未実装事項を簡潔に説明してください。

### 6. 越えてはいけない境界

- Game Fieldsの`main`、`develop`、Vercel、本番環境へpush・deployしない
- DB、Redis、Blob、認証Cookie、APIキー、管理者情報へ直接アクセスしない
- SDKや安全境界に不足がある場合、危険な代替実装を加えず`SDK_REQUESTS.md`へ記録する
- 完成物が自動公開されるとは説明しない。Game Fields側の検査・審査・dev実プレイ確認が別途必要である
