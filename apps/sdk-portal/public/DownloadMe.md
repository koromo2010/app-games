# Game Fieldsでゲームを作る

このファイルは、ChatGPT Proと一緒にGame Fields向けゲーム制作を始めるための入口です。SDK本体やゲーム雛形はこのファイルには入っていません。ChatGPTが下記の公開スターターを取得して作業します。

- Game Fields Platform: `v0.1.0`
- SDK package: `v0.1.0`
- SDK contract schema: `v1`
- SDK connection: `https://sdk-dev.game-fields.com`

## SDK接続先

このファイルを使う制作では、予約、制作者用広場、部屋、プレビュー、登録APIの接続先として必ず`https://sdk-dev.game-fields.com`を使ってください。URLを別のSDK環境へ置き換えてはいけません。接続先が`sdk-dev`でも`sdk`でも、質問、モック作成、実装、検査、提出までの制作フローと完成条件は同一です。

## 利用者が行うこと

1. このファイルをChatGPTへ添付します。
2. 次の一文を送ります。

```text
このファイルに従って、Game Fields向けのゲームを作りたいです。
```

ChatGPTは最初に、あなた専用のSDK環境で使うURL名を聞きます。小文字英数字とハイフンで希望名を答えてください。URL確定後、ゲームの核を対話で決めます。

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

### 2. 制作者用URL名を確認・予約する

最初の利用者向け質問は、ゲーム仕様ではなく次の一問にしてください。

> あなた専用のGame Fields SDK環境で使うURL名を決めます。`yusuke-lab`のように、小文字英数字とハイフンで希望名を教えてください。

回答をURL用に小文字化し、空白や記号をハイフンへ変換したうえで、次の公式APIへ問い合わせてください。

```text
GET https://sdk-dev.game-fields.com/api/instances/check?slug=<希望名>
```

空いていれば次へ予約し、返された`url`を利用者へ伝えてください。

```text
POST https://sdk-dev.game-fields.com/api/instances/reserve
Content-Type: application/json

{"slug":"<希望名>","displayName":"<表示名>"}
```

`reservationToken`は秘密情報として扱い、会話やGitへ転載せず、後続のSDK登録処理だけに渡してください。重複時は、元の希望に短い数字や単語を付けた候補を3件まとめて再確認してください。一件ずつ候補を尋ね続けてはいけません。APIが利用不能な場合は予約済みと偽らず、復旧後に再試行が必要と伝えてください。

予約後、同じ接続先で制作者URLを正式確定してください。

```text
POST https://sdk-dev.game-fields.com/api/instances/finalize
Content-Type: application/json

{"slug":"<予約した名前>","reservationToken":"<予約時の秘密トークン>"}
```

返された`managementToken`は制作者環境へゲームを登録・更新するための秘密情報です。画面、会話、Git、提出ZIPへ記録せず、後続APIの`Authorization: Bearer <managementToken>`だけに使用してください。Game Fields側も平文では保存せず、再表示できません。

制作者用URLはゲーム単位ではありません。同じ制作者が作るゲームは、すべて同じ`https://sdk-dev.game-fields.com/<slug>`の広場へ追加します。

### 3. 公式スターターを取得する

新しい空の作業場所で、次の公開ブランチだけを浅く取得してください。

```bash
git clone --depth 1 --single-branch --branch sdk-starter https://github.com/koromo2010/app-games.git game-fields-game
cd game-fields-game
```

取得後、`starter-manifest.json`の以下を確認してください。

- `repository`が`https://github.com/koromo2010/app-games`
- `ref`が`sdk-starter`
- `sdkVersion`が空でない
- `platformVersion`と`sdkContractVersion`が空でない

不一致やファイル欠落がある場合は作業を止め、取得に失敗したことを利用者へ伝えてください。他のリポジトリ、ブランチ、非公式ミラーへ切り替えないでください。

### 4. スターターの指示を読む

次の順で読み、以降はリポジトリ内の指示を正本として扱ってください。

1. `START_HERE.md`
2. `AGENTS.md`
3. `APP_REQUIREMENTS.md`
4. `GAME_SPEC.md`
5. `MOCK_GUIDE.md`
6. `SDK_API.md`

読み終えたら、まずゲームの核が決まるまで自然な対話を行ってください。ゲームの面白さ、人数、勝敗が固まった時点で、詳細ルール・画面・進行・採用モジュールをAIが一括提案します。核が決まる前に長い詳細質問票を出さず、核が決まった後に細かな質問を一問ずつ続けてもいけません。

回答を受けたら、一般的で安全な初期値をAI判断として補い、`GAME_SPEC.md`を完成させ、そのままモックを作ってください。追加質問は、個人情報、課金、公開範囲、秘密情報など、安全性や根本構造に関わり、仮置きでは制作できない事項がある場合だけ、一度にまとめて行ってください。好みや細部を埋めるための再質問はしないでください。

### 5. 仕様に沿ったモックを作る

`GAME_SPEC.md`の未決事項が解消したら、`APP_REQUIREMENTS.md`と`MOCK_GUIDE.md`に従い、`mock/`へブラウザで開ける画面モックを作ってください。

モック作成後は、利用者へ次の内容を短く説明してください。

- 作った画面と操作の流れ
- Game Fields共通要件をどう反映したか
- モックで確認できる状態
- 本実装まで動かない部分

説明の最後は、原則として次の一文にしてください。

> モックを作成しました。実際に画面を見て、変えたいところはありますか？ 気になる部分をそのまま教えてください。特になければ「これでOK」と答えてください。

修正希望があればまとめて反映し、同じ聞き方で再確認してください。「これでOK」などの明確な承認前にSDK契約の本実装へ進まないでください。

### 6. 承認後に実装・検査・提出物作成まで進める

仕様確定後は、スターター内だけでゲーム固有コードとテストを実装し、次をすべて成功させてください。

```bash
npm install
npm run check:mock
npm run check
npm run demo
npm run package
```

最後に`submission/game-fields-submission.zip`を利用者へ返し、実装済みの内容、テスト結果、未実装事項を簡潔に説明してください。

### 7. 越えてはいけない境界

- Game Fieldsの`main`、`develop`、Vercel、本番環境へpush・deployしない
- DB、Redis、Blob、認証Cookie、APIキー、管理者情報へ直接アクセスしない
- SDKや安全境界に不足がある場合、危険な代替実装を加えず`SDK_REQUESTS.md`へ記録する
- 完成物が自動公開されるとは説明しない。Game Fields側の検査・審査・dev実プレイ確認が別途必要である
