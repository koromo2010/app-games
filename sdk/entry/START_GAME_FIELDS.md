# Game Fieldsでゲームを作る

このファイルは、ChatGPT Proと一緒にGame Fields向けゲーム制作を始めるための入口です。SDK本体やゲーム雛形はこのファイルには入っていません。ChatGPTが下記の公開スターターを取得して作業します。

- Game Fields Platform: `v__PLATFORM_VERSION__`
- DownloadMe: `ver9`
- SDK package: `v__SDK_VERSION__`
- SDK handshake: `v__SDK_HANDSHAKE_VERSION__`
- SDK contract schema: `v__SDK_CONTRACT_VERSION__`
- SDK environment: `__SDK_ENVIRONMENT__`
- SDK connection: `__SDK_PORTAL_BASE_URL__`

## SDK接続先

このファイルを使う制作では、予約、制作者用広場、部屋、プレビュー、登録APIの接続先として必ず`__SDK_PORTAL_BASE_URL__`を使ってください。URLを別のSDK環境へ置き換えてはいけません。接続先が`sdk-dev`でも`sdk`でも、質問、モック作成、実装、検査、提出までの制作フローと完成条件は同一です。

## Work／Codex共通のSDKログイン

このDownloadMeにパスワード、Cookie、アクセストークンは含まれません。制作操作には、次のOAuth 2.1対応MCPを使用してください。

```text
__SDK_PORTAL_BASE_URL__/api/mcp
```

ChatGPT WorkではGame Fields App、Codexでは同じリモートMCPとして接続します。未接続の場合は、利用者へ上記接続先の追加を案内し、ブラウザに表示されるGame Fieldsの認可画面で許可してもらってください。パスワードやトークンを会話へ貼り付けるよう求めてはいけません。一度接続した後のアクセストークン更新は制作クライアントに任せます。

ChatGPT WorkではGame Fields SDK toolsが必要になるまで遅延読み込みされ、最初のtool一覧だけには現れないことがあります。Game Fields SDK toolsが見つからないと判断する前に、利用可能なtool検索・発見機能で`gameapp-dev get_sdk_handshake Game Fields SDK接続互換性`を検索し、見つかった`get_sdk_handshake`を現在のチャットへ読み込んでください。検索で見つかった場合は、プラグイン更新を案内せず、そのまま下記のhandshakeを呼び出します。最初のtool一覧に名前がないことだけを根拠に、未接続や旧版と判定してはいけません。

上記の明示的なtool検索を実行しても、`gameapp-dev`のtoolが1件以上見つかる一方で`get_sdk_handshake`だけが見つからない場合に限り、プラグインは更新前です。URL名やゲーム内容を質問せず、次の案内だけを表示して作業を止めてください。ほかのtoolで制作を続けたり、開発者モードで別接続を追加したりしてはいけません。

> `gameapp-dev`プラグインが古いため、このDownloadMeが必要とするSDK接続確認を実行できません。ChatGPTのプラグイン管理画面で`gameapp-dev`を更新し、更新後に新しいチャットを開いて`gameapp-dev`を選択し直し、このDownloadMeをもう一度添付してください。

MCP接続やOAuth成功だけでは、SDK接続完了とみなしません。接続直後は最初に`get_sdk_handshake`を次の内容で呼び出してください。
`requiredCapabilities`は以下の4件をそのまま送り、tool schemaに見える別surface向けの候補を追加してはいけません。

```json
{
  "protocol": "game-fields-sdk",
  "handshakeVersion": __SDK_HANDSHAKE_VERSION__,
  "client": {
    "kind": "ai-agent",
    "name": "ChatGPT"
  },
  "expected": {
    "environment": "__SDK_ENVIRONMENT__",
    "platformVersion": "__PLATFORM_VERSION__",
    "sdkPackageVersion": "__SDK_VERSION__",
    "sdkContractVersion": __SDK_CONTRACT_VERSION__
  },
  "requiredCapabilities": [
    "oauth2-pkce",
    "creator-environments",
    "starter-download",
    "mock-publish"
  ]
}
```

応答の`accepted`が`true`で、`environment`、`release`、`endpoints.portal`がこのDownloadMeの記載と一致した場合だけ制作を開始してください。`accepted=false`、`problems`が1件以上、接続先環境や版の不一致、必須機能不足のいずれかがある場合は作業を止め、SDKハンドシェイクに失敗したことと`problems[].code`だけを利用者へ伝えてください。別のSDK URLへ推測で切り替えてはいけません。

## 利用者が行うこと

1. このファイルをChatGPTへ添付します。
2. 次の一文を送ります。

```text
このファイルに従って、Game Fields向けのゲームを作りたいです。
```

ChatGPTはSDK接続状態を確認した後、同じGame Fieldsアカウントで以前作ったSDK環境があるか確認します。既存環境があればそこへ再ログインして続きから制作し、ない場合だけ新しいURL名を聞きます。環境確定後、ゲームの核を対話で決めます。

---

## ChatGPTへの実行指示

この文書を読んだChatGPTは、次の順番を守ってください。

### 1. 作業能力を確認する

最初に、現在のモードで以下を実行できるか確認してください。

- 公開Gitリポジトリを取得する
- 複数ファイルを読み書きする
- Node.jsのコマンドを実行する
- 完成したZIPファイルを利用者へ返す
- `__SDK_PORTAL_BASE_URL__/api/mcp`のGame Fields SDK toolsを利用する（Workでは通常`gameapp-dev`プラグイン経由）

すべて可能なら、モードの説明や確認質問をせず、そのまま次へ進んでください。

一つでも実行できない場合は、実装したふりをせず、次の案内だけを表示して作業を止めてください。

> このゲーム制作にはコード操作が必要です。ChatGPTのWorkモードまたはCodexを開き、このファイルをもう一度添付してください。

#### この制作で「完成」と呼べる状態

このファイル単体から`index.html`、ZIP、チャット内プレビューなどを作っただけでは、Game Fieldsのモック作成は未完了です。作業用のローカルファイルは、後述する公式スターターを取得したフォルダ内に限って作成できますが、それを利用者向けの完成URLの代わりにしてはいけません。

モック作成の完了条件は、次のすべてです。

1. 公式スターター内の`mock/`へゲームを作る
2. `npm run check:mock`を成功させる
3. `npm run publish:mock`で`https://sdk-dev.game-fields.com`へ保存する
4. SDKから`saved: true`、`creatorUrl`、`gameUrl`を受け取る
5. `creatorUrl`を最初のクリック可能なリンクとして案内し、`gameUrl`は今回のゲームへの補助リンクとして添える

SDKへ接続できない、認証できない、保存できない、または`creatorUrl`を取得できない場合は、ローカルプレビューを代替完成品として返さず「SDKへの保存は未完了」と明記してください。SDK URLを取得する前に「ゲームを作成しました」「完成しました」と報告してはいけません。

### 2. SDKへログインし、既存環境へ戻るか新規作成する

Game Fields SDK toolsが未接続と判断する前に、Workでは上記の完全な語句でtool検索を実行してください。検索で`get_sdk_handshake`が見つかれば現在のチャットへ読み込み、質問より先に呼び出します。検索しても`gameapp-dev`自体が見つからない場合は、利用者へプラグインの追加・選択を案内してください。プラグインが候補に存在しない場合だけ、開発者モードをONにして`__SDK_PORTAL_BASE_URL__/api/mcp`をOAuth Appとして追加する手順へ進みます。明示的な検索後に、`gameapp-dev`のほかのtoolは見つかるのに`get_sdk_handshake`だけがない場合に限って更新前と判定し、上記の定型文でプラグイン更新、新しいチャットでの再選択、このDownloadMeの再添付だけを案内して停止します。Codexでは同じURLをリモートMCPとして接続します。OAuth画面では、すでにSDK Portalへ接続済みのGame Fieldsアカウントで「この制作クライアントを許可」を押します。接続後、質問より先に上記の`get_sdk_handshake`を呼び、`accepted=true`を確認します。接続確認前にURL名やゲーム内容を尋ねてはいけません。

ハンドシェイク成功直後に`list_creator_environments`を呼び出してください。

- 既存環境が1件なら、そのslugを今回の制作先として自動選択し、「既存の`<url>`へ再ログインしました」と伝えてください。新しいURL名を尋ねたり予約し直したりしてはいけません。
- 既存環境が複数なら、URLとゲーム数を一覧で示し、どの環境で続けるか一度だけ尋ねてください。選択されたslugをそのまま使います。
- 既存環境が0件の場合だけ、次の新規作成質問へ進んでください。

新規作成時の最初の利用者向け質問は、ゲーム仕様ではなく次の一問にしてください。

> あなた専用のGame Fields SDK環境で使うURL名を決めます。`yusuke-lab`のように、小文字英数字とハイフンで希望名を教えてください。

回答をURL用に小文字化し、空白や記号をハイフンへ変換したうえで、Game Fields SDKの`check_creator_url`を呼び出してください。既存環境を選んだ場合、この空き確認・予約・確定処理は行いません。

空いていれば`reserve_creator_url`を呼び、返された`url`を利用者へ伝えてください。

`reservationToken`は秘密情報として扱い、会話やGitへ転載せず、後続のSDK登録処理だけに渡してください。重複時は、元の希望に短い数字や単語を付けた候補を3件まとめて再確認してください。一件ずつ候補を尋ね続けてはいけません。APIが利用不能な場合は予約済みと偽らず、復旧後に再試行が必要と伝えてください。

予約後、同じ接続先の`finalize_creator_url`へ予約トークンを渡し、制作者URLを正式確定してください。予約トークンは会話やGitへ転載せず、tool引数としてだけ使用します。MCPはログイン中のGame Fieldsアカウントと予約所有者が一致しない確定を拒否します。

制作者用URLはゲーム単位ではありません。同じ制作者が作るゲームは、すべて同じ`__SDK_PORTAL_BASE_URL__/<slug>`の広場へ追加します。

### 3. 公式スターターを取得する

新しい空の作業場所で、次の公開ブランチだけを浅く取得してください。

```bash
git clone --depth 1 --single-branch --branch sdk-starter https://github.com/koromo2010/app-games.git game-fields-game
cd game-fields-game
```

取得後、`starter-manifest.json`の以下を確認してください。

- `repository`が`https://github.com/koromo2010/app-games`
- `ref`が`sdk-starter`
- `downloadMeVersion`が`9`
- `sdkVersion`が空でない
- `sdkHandshakeVersion`がこのDownloadMeのSDK handshakeと一致する
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

`mock/preview.json`のゲームID・表示名・説明も今回の仕様へ更新し、`npm run check:mock`を成功させてください。その後、Game Fields SDKの`publish_mock` toolへ制作者slug、ゲーム情報、検査済み`mock/`ファイル一式を渡します。OAuth資格情報をファイル、Git、会話、コマンド引数へ展開してはいけません。スターターの`npm run publish:mock`は旧管理トークン互換用であり、Work／Codexの新規制作では使いません。

SDKはモック一式を裏側の専用Gitへ自動保存し、制作者トップ`/<slug>/`と今回のゲーム`/<slug>/games/<game-id>`のURLを発行します。利用者への最初のリンクは、保存ゲーム一覧を確認できる制作者トップにしてください。今回のゲームURLは直接確認用の補助リンクとして添えます。GitHubやVercelでゲームごとのデプロイ操作をさせないでください。修正時も同じコマンドで更新し、案内URLは変えません。

コマンドが返した`saved: true`、`creatorUrl`、`gameUrl`を必ず確認してください。後方互換用の`previewUrl`が返る場合も、最初の案内には使わず`creatorUrl`を優先します。`mock/index.html`のローカルパス、ChatGPT内のプレビュー、ダウンロード用HTML、独自に推測したURLを、SDK発行URLとして案内してはいけません。

最初のモックでは共通モジュール38件をすべて必須として使用します。制作AIはモック、AppSet、manifestから必須moduleを変更せず、同等機能も再実装しません。

モック作成後は、利用者へ次の内容を短く説明してください。

- 作った画面と操作の流れ
- SDK上で発行された制作者トップURLと今回のゲームURL
- Game Fields共通要件をどう反映したか
- モックで確認できる状態
- 本実装まで動かない部分

最終案内には、最低限次の形式を含めてください。

> 「ゲーム名」をGame Fields SDKへ保存しました。
> [あなたのGame Fields環境を開く](SDKから返されたcreatorUrl)
> [今回のゲームを直接開く](SDKから返されたgameUrl)

説明の最後は、原則として次の一文にしてください。

> モックを作成しました。実際に画面を見て、変えたいところはありますか？ 気になる部分をそのまま教えてください。特になければ「これでOK」と答えてください。

修正希望があればまとめて反映し、同じ聞き方で再確認してください。「これでOK」などの明確な承認前にSDK契約の本実装へ進まないでください。

### 6. 承認後に実装・検査・提出物作成まで進める

利用者がモックを承認したら、実装開始前に`get_game_module_requirements`を今回のslugとgameIdで呼び出してください。応答の`editableByAi`が`false`であることを確認し、`requiredModuleIds`に返されたmoduleをすべて使用します。各`requiredModules`の`delivery`、`packageExports`、`publicApis`、`usage`に従い、Platform所有moduleを複製せず、公開resourceは指定されたpackage exportから利用します。AIはSDK-dev内部の分類や変更可能性を推測しません。一覧と契約を取得できない場合は本実装を始めず、SDK profileを確認できないことを利用者へ伝えてください。

仕様とmodule profileの確定後は、スターター内だけでゲーム固有コードとテストを実装し、次をすべて成功させてください。

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
